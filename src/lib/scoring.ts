import type {
  ActionCategory,
  ActionType,
  Layer,
  QualifyReadiness,
  QueryClassification,
  ScoreEvent,
  ScoreSummary,
  SessionScoringState,
  TableRow,
} from "../types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const SILVER_THRESHOLD = 85;
const GOLD_THRESHOLD = 92;

function normalizeValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function rowSignature(row: TableRow, columns: string[]) {
  return JSON.stringify(
    columns.reduce<Record<string, string | number | null>>((acc, column) => {
      acc[column] = row[column] ?? null;
      return acc;
    }, {}),
  );
}

function isNumericLike(value: string) {
  return /^-?\d+(\.\d+)?$/.test(value);
}

function isDateLike(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{2}\/\d{2}\/\d{4}$/.test(value);
}

function isCanonicalCountry(value: string) {
  return ["USA", "United Kingdom", "Canada", "Australia", "New Zealand"].includes(value);
}

function isCanonicalStatus(value: string) {
  return value === "active" || value === "inactive";
}

function countNullsByColumn(rows: TableRow[], columns: string[]) {
  const counts = Object.fromEntries(columns.map((column) => [column, 0])) as Record<string, number>;
  for (const row of rows) {
    for (const column of columns) {
      const value = row[column];
      if (value === null || value === "") {
        counts[column] += 1;
      }
    }
  }
  return counts;
}

function inferCorrectTypeColumns(rows: TableRow[], columns: string[]) {
  let correct = 0;

  for (const column of columns) {
    const values = rows.map((row) => row[column]).filter((value) => value !== null && value !== "");
    if (values.length === 0) {
      continue;
    }

    const valid = values.every((value) => {
      const normalized = normalizeValue(value);
      switch (column) {
        case "id":
          return isNumericLike(normalized);
        case "signup_date":
          return isDateLike(normalized);
        case "amount":
          return isNumericLike(normalized);
        case "email":
          return EMAIL_REGEX.test(normalized);
        case "country":
          return isCanonicalCountry(normalized);
        case "status":
          return isCanonicalStatus(normalized);
        default:
          return true;
      }
    });

    if (valid) {
      correct += 1;
    }
  }

  return correct;
}

function isCleanRow(row: TableRow, columns: string[]) {
  for (const column of columns) {
    const value = row[column];
    if (value === null || value === "") {
      return false;
    }
  }

  const email = normalizeValue(row.email);
  const amount = normalizeValue(row.amount);
  const signupDate = normalizeValue(row.signup_date);
  const country = normalizeValue(row.country);
  const status = normalizeValue(row.status);

  if (email && !EMAIL_REGEX.test(email)) {
    return false;
  }
  if (amount && !isNumericLike(amount)) {
    return false;
  }
  if (signupDate && !isDateLike(signupDate)) {
    return false;
  }
  if (country && !isCanonicalCountry(country)) {
    return false;
  }
  if (status && !isCanonicalStatus(status)) {
    return false;
  }

  return true;
}

function countDuplicateRows(rows: TableRow[], columns: string[]) {
  const signatures = rows.map((row) => rowSignature(row, columns));
  return signatures.length - new Set(signatures).size;
}

function countMalformedEmails(rows: TableRow[]) {
  let malformed = 0;
  for (const row of rows) {
    const email = normalizeValue(row.email);
    if (email && !EMAIL_REGEX.test(email)) {
      malformed += 1;
    }
  }
  return malformed;
}

export function summarizeScore(
  rows: TableRow[],
  columns: string[],
  baseline?: ScoreSummary,
): ScoreSummary {
  const duplicateRows = countDuplicateRows(rows, columns);
  const nullCells = rows.reduce((sum, row) => {
    return (
      sum +
      columns.reduce((columnSum, column) => {
        const value = row[column];
        return columnSum + (value === null || value === "" ? 1 : 0);
      }, 0)
    );
  }, 0);
  const malformedEmails = countMalformedEmails(rows);
  const cleanRows = rows.filter((row) => isCleanRow(row, columns)).length;
  const correctTypes = inferCorrectTypeColumns(rows, columns);
  const originalNulls = baseline?.originalNulls ?? nullCells;
  const originalDuplicates = Math.max(1, baseline?.originalDuplicates ?? duplicateRows);
  const filledNulls = Math.max(0, originalNulls - nullCells);
  const deduped = Math.max(0, originalDuplicates - duplicateRows);
  const totalColumns = columns.length;
  const qualityScore =
    ((rows.length === 0 ? 0 : cleanRows / rows.length) * 0.4 +
      (originalNulls === 0 ? 1 : filledNulls / originalNulls) * 0.25 +
      (totalColumns === 0 ? 0 : correctTypes / totalColumns) * 0.2 +
      (originalDuplicates === 0 ? 1 : deduped / originalDuplicates) * 0.15) *
    100;

  return {
    score: Number(Math.max(0, Math.min(100, qualityScore)).toFixed(1)),
    duplicateRows,
    nullCells,
    malformedEmails,
    cleanRows,
    originalNulls,
    filledNulls,
    originalDuplicates,
    deduped,
    correctTypes,
    totalColumns,
  };
}

function normalizeSql(sql: string) {
  return sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function extractColumns(sql: string) {
  const normalized = sql.toLowerCase();
  const columns = ["id", "first_name", "last_name", "email", "country", "signup_date", "amount", "status"];
  return columns.filter((column) => normalized.includes(column));
}

export function classifyQuery(sql: string): QueryClassification {
  const normalized = normalizeSql(sql);
  const targetedColumns = extractColumns(normalized);
  const hasCount = /\bcount\s*\(/.test(normalized);
  const hasLimit = /\blimit\b/.test(normalized);
  const hasGroupBy = /\bgroup by\b/.test(normalized);
  const hasRowNumber = /\brow_number\s*\(/.test(normalized) || /\bpartition by\b/.test(normalized);
  const hasCase = /\bcase\b/.test(normalized);
  const hasCast = /\bcast\s*\(|::/.test(normalized);
  const hasNullHandling = /\bcoalesce\s*\(|\bis not null\b|\bis null\b/.test(normalized);
  const hasNormalization = /\btrim\s*\(|\blower\s*\(|\bupper\s*\(|\breplace\s*\(/.test(normalized);
  const hasOutlierHandling = /\bgreatest\s*\(|\bleast\s*\(|\bbetween\b/.test(normalized);
  const hasDistinct = /\bdistinct\b/.test(normalized);
  const cteCount = (normalized.match(/\b[a-z_][a-z0-9_]*\s+as\s*\(/g) ?? []).length;

  if (hasCount || hasLimit || (normalized.startsWith("select *") && !hasNormalization && !hasCast && !hasCase) || (hasGroupBy && !hasCase && !hasDistinct)) {
    return {
      category: "C",
      actionType: "SCAN_USEFUL",
      raceEvent: "SCAN_USEFUL",
      targetedColumns,
    };
  }

  if (hasRowNumber || hasDistinct || hasCase) {
    return {
      category: "B",
      actionType: hasRowNumber || hasDistinct ? "DEDUPLICATION" : "CONDITIONAL_FIX",
      raceEvent: "CORNER_TAKEN",
      targetedColumns,
    };
  }

  if (hasNullHandling || hasNormalization || hasCast || hasOutlierHandling || cteCount > 0) {
    let actionType: ActionType = "VALID_TRANSFORMATION";
    if (hasNullHandling) {
      actionType = "NULL_HANDLING";
    } else if (hasCast) {
      actionType = "SCHEMA_CAST";
    } else if (hasNormalization) {
      actionType = "NORMALIZATION";
    } else if (hasOutlierHandling) {
      actionType = "OUTLIER_HANDLING";
    }

    return {
      category: "A",
      actionType,
      raceEvent: "STRAIGHT_BOOST",
      targetedColumns,
    };
  }

  return {
    category: "C",
    actionType: "SCAN_USEFUL",
    raceEvent: "SCAN_USEFUL",
    targetedColumns,
  };
}

function detectRowsAffected(previousRows: TableRow[], nextRows: TableRow[], columns: string[]) {
  const sharedLength = Math.min(previousRows.length, nextRows.length);
  let changed = 0;

  for (let index = 0; index < sharedLength; index += 1) {
    if (rowSignature(previousRows[index], columns) !== rowSignature(nextRows[index], columns)) {
      changed += 1;
    }
  }

  return changed + Math.abs(previousRows.length - nextRows.length);
}

function columnIssueCount(rows: TableRow[], column: string) {
  switch (column) {
    case "email":
      return rows.filter((row) => {
        const value = normalizeValue(row.email);
        return value !== "" && !EMAIL_REGEX.test(value);
      }).length;
    case "country":
      return rows.filter((row) => {
        const value = normalizeValue(row.country);
        return value !== "" && !isCanonicalCountry(value);
      }).length;
    case "status":
      return rows.filter((row) => {
        const value = normalizeValue(row.status);
        return value !== "" && !isCanonicalStatus(value);
      }).length;
    case "amount":
      return rows.filter((row) => {
        const value = normalizeValue(row.amount);
        return value !== "" && !isNumericLike(value);
      }).length;
    case "signup_date":
      return rows.filter((row) => {
        const value = normalizeValue(row.signup_date);
        return value !== "" && !isDateLike(value);
      }).length;
    default:
      return rows.filter((row) => {
        const value = row[column];
        return value === null || value === "";
      }).length;
    }
}

function buildQualifyReadiness(score: number): QualifyReadiness {
  return {
    current_score: Number(score.toFixed(1)),
    silver_threshold: SILVER_THRESHOLD,
    gold_threshold: GOLD_THRESHOLD,
    recommendation: score >= GOLD_THRESHOLD ? "READY_FOR_GOLD" : score >= SILVER_THRESHOLD ? "READY_FOR_SILVER" : "KEEP_CLEANING",
    projected_penalty:
      score >= GOLD_THRESHOLD ? null : score >= SILVER_THRESHOLD ? null : "FLAT_TYRE if qualified now",
  };
}

function createPenaltyEvent(params: {
  actionType: ActionType;
  raceEvent: string;
  speedDelta: number;
  fuelDelta: number;
  qualityScore: number;
  rowsAffected: number;
  rowsDropped: number;
  penaltyReason: string;
  hudMessage: string;
}): ScoreEvent {
  return {
    action_category: "D",
    action_type: params.actionType,
    race_event: params.raceEvent,
    speed_delta: params.speedDelta,
    fuel_delta: params.fuelDelta,
    momentum_active: false,
    quality_score: params.qualityScore,
    rows_affected: params.rowsAffected,
    rows_dropped: params.rowsDropped,
    locked_errors: [],
    penalty_reason: params.penaltyReason,
    hud_message: params.hudMessage,
    visual_cue: params.raceEvent,
    qualify_readiness: buildQualifyReadiness(params.qualityScore),
  };
}

export function scorePreview(params: {
  sql: string;
  previousRows: TableRow[];
  previousColumns: string[];
  nextRows: TableRow[];
  nextColumns: string[];
  scoringState: SessionScoringState;
  executionSuccess: boolean;
  errorMessage?: string | null;
}): ScoreEvent {
  const { sql, previousRows, previousColumns, nextRows, nextColumns, scoringState, executionSuccess, errorMessage } = params;
  const baseline = scoringState.baselineSummary;
  const columns = nextColumns.length > 0 ? nextColumns : previousColumns;

  if (!executionSuccess) {
    return createPenaltyEvent({
      actionType: "SPIN_OUT",
      raceEvent: "SPIN_OUT",
      speedDelta: -15,
      fuelDelta: -5,
      qualityScore: scoringState.lastScoreEvent?.quality_score ?? baseline.score,
      rowsAffected: 0,
      rowsDropped: 0,
      penaltyReason: errorMessage ?? "Query execution failed.",
      hudMessage: "Execution failed — car spun out",
    });
  }

  const classification = classifyQuery(sql);
  const nextSummary = summarizeScore(nextRows, columns, baseline);
  const previousSummary = summarizeScore(previousRows, previousColumns, baseline);
  const rowsDropped = Math.max(0, previousRows.length - nextRows.length);
  const rowsAffected = detectRowsAffected(previousRows, nextRows, columns);
  const qualityDelta = nextSummary.score - previousSummary.score;
  const nullsBefore = countNullsByColumn(previousRows, previousColumns);
  const nullsAfter = countNullsByColumn(nextRows, columns);
  const cteCount = (normalizeSql(sql).match(/\b[a-z_][a-z0-9_]*\s+as\s*\(/g) ?? []).length;

  if (rowsDropped > previousRows.length * 0.15) {
    return createPenaltyEvent({
      actionType: "TYRE_PUNCTURE",
      raceEvent: "TYRE_PUNCTURE",
      speedDelta: -20,
      fuelDelta: -8,
      qualityScore: nextSummary.score,
      rowsAffected,
      rowsDropped,
      penaltyReason: "Dropped more than 15% of rows.",
      hudMessage: "Too many rows lost — tyre puncture",
    });
  }

  const overwrittenColumn = previousColumns.find((column) => nullsBefore[column] === 0 && (nullsAfter[column] ?? 0) > 0);
  if (overwrittenColumn) {
    return createPenaltyEvent({
      actionType: "COLLISION",
      raceEvent: "COLLISION",
      speedDelta: -25,
      fuelDelta: -8,
      qualityScore: nextSummary.score,
      rowsAffected,
      rowsDropped,
      penaltyReason: `Clean column overwritten with nulls: ${overwrittenColumn}.`,
      hudMessage: "Clean data damaged — collision detected",
    });
  }

  const normalizedSql = normalizeSql(sql);
  if (scoringState.confirmedSql.includes(normalizedSql)) {
    return createPenaltyEvent({
      actionType: "FUEL_WASTE",
      raceEvent: "FUEL_WASTE",
      speedDelta: -10,
      fuelDelta: -6,
      qualityScore: nextSummary.score,
      rowsAffected,
      rowsDropped,
      penaltyReason: "Repeated identical confirmed transform.",
      hudMessage: "No gain from repeating the same move",
    });
  }

  const alreadyCleanColumns = classification.targetedColumns.filter((column) => columnIssueCount(previousRows, column) === 0);
  if ((classification.category === "A" || classification.category === "B") && alreadyCleanColumns.length > 0 && alreadyCleanColumns.length === classification.targetedColumns.length) {
    return createPenaltyEvent({
      actionType: "PIT_STOP_WASTED",
      raceEvent: "PIT_STOP_WASTED",
      speedDelta: -12,
      fuelDelta: -5,
      qualityScore: nextSummary.score,
      rowsAffected,
      rowsDropped,
      penaltyReason: `Transformed already-clean columns: ${alreadyCleanColumns.join(", ")}.`,
      hudMessage: "Efficiency dropping — simplify your approach",
    });
  }

  if (classification.category === "C") {
    const targeted = classification.targetedColumns.length > 0 ? classification.targetedColumns : previousColumns;
    const maxScanCount = Math.max(...targeted.map((column) => scoringState.scanHistory[column] ?? 0));
    const actionType: ActionType = maxScanCount === 0 ? "SCAN_USEFUL" : maxScanCount === 1 ? "SCAN_REDUNDANT" : "CAUTION_FLAG";
    const raceEvent = actionType;
    const speedDelta = maxScanCount === 0 ? 0 : maxScanCount === 1 ? -3 : -8;
    const fuelDelta = maxScanCount === 0 ? -2 : maxScanCount === 1 ? -4 : -6;

    if (scoringState.queryCount >= 3) {
      return createPenaltyEvent({
        actionType: "POSITION_LOST",
        raceEvent: "POSITION_LOST",
        speedDelta: -8,
        fuelDelta: -6,
        qualityScore: nextSummary.score,
        rowsAffected,
        rowsDropped,
        penaltyReason: "Four or more scans with no cleaning intent.",
        hudMessage: "Too much scanning — position lost",
      });
    }

    return {
      action_category: "C",
      action_type: actionType,
      race_event: raceEvent,
      speed_delta: speedDelta,
      fuel_delta: fuelDelta,
      momentum_active: false,
      quality_score: nextSummary.score,
      rows_affected: rowsAffected,
      rows_dropped: rowsDropped,
      locked_errors: [],
      penalty_reason: null,
      hud_message:
        actionType === "SCAN_USEFUL"
          ? "Useful scan — reading the track"
          : actionType === "SCAN_REDUNDANT"
            ? "Repeat scan — low-value telemetry"
            : "Caution flag — scan discipline slipping",
      visual_cue: raceEvent,
      qualify_readiness: buildQualifyReadiness(nextSummary.score),
    };
  }

  if (cteCount >= 3 && qualityDelta < 2) {
    return createPenaltyEvent({
      actionType: "OVER_ENGINEERED",
      raceEvent: "OVER_ENGINEERED",
      speedDelta: -10,
      fuelDelta: -5,
      qualityScore: nextSummary.score,
      rowsAffected,
      rowsDropped,
      penaltyReason: "Three or more CTEs with less than 2% quality improvement.",
      hudMessage: "Efficiency dropping — simplify your approach",
    });
  }

  const precededBySetup = scoringState.confirmedActions.includes("SCHEMA_CAST") || scoringState.confirmedActions.includes("MOMENTUM_SETUP");
  let speedDelta = 0;
  let fuelDelta = 0;
  let momentumActive = false;

  if (classification.category === "A") {
    speedDelta = rowsAffected > 10 ? 15 : 8;
    fuelDelta = -5;
  } else {
    speedDelta = rowsAffected > 10 ? 25 : 15;
    fuelDelta = -8;
    if (precededBySetup) {
      speedDelta = Math.round(speedDelta * 1.5);
      momentumActive = true;
    }
  }

  return {
    action_category: classification.category,
    action_type: classification.actionType,
    race_event: classification.raceEvent,
    speed_delta: speedDelta,
    fuel_delta: fuelDelta,
    momentum_active: momentumActive,
    quality_score: nextSummary.score,
    rows_affected: rowsAffected,
    rows_dropped: rowsDropped,
    locked_errors: [],
    penalty_reason: null,
    hud_message:
      classification.category === "A"
        ? "Cleaning move landed — car accelerating"
        : "Technical section cleared — momentum building",
    visual_cue: classification.raceEvent,
    qualify_readiness: buildQualifyReadiness(nextSummary.score),
  };
}

export function applyConfirmedScore(scoringState: SessionScoringState, scoreEvent: ScoreEvent, sql: string, rows: TableRow[], columns: string[]) {
  const normalizedSql = normalizeSql(sql);
  const targetedColumns = classifyQuery(sql).targetedColumns;
  const nextScanHistory = { ...scoringState.scanHistory };

  if (scoreEvent.action_category === "C") {
    const columnsToTrack = targetedColumns.length > 0 ? targetedColumns : columns;
    for (const column of columnsToTrack) {
      nextScanHistory[column] = (nextScanHistory[column] ?? 0) + 1;
    }
  }

  return {
    ...scoringState,
    currentSpeed: Math.max(0, scoringState.currentSpeed + scoreEvent.speed_delta),
    currentFuel: Math.max(0, scoringState.currentFuel + scoreEvent.fuel_delta),
    queryCount: scoringState.queryCount + 1,
    scanHistory: nextScanHistory,
    confirmedActions:
      scoreEvent.action_category === "D" ? scoringState.confirmedActions : [...scoringState.confirmedActions, scoreEvent.action_type],
    confirmedSql: scoreEvent.action_category === "D" ? scoringState.confirmedSql : [...scoringState.confirmedSql, normalizedSql],
    momentumActive: scoreEvent.momentum_active,
    baselineSummary: scoringState.baselineSummary,
    lastScoreEvent: {
      ...scoreEvent,
      quality_score: summarizeScore(rows, columns, scoringState.baselineSummary).score,
      qualify_readiness: buildQualifyReadiness(summarizeScore(rows, columns, scoringState.baselineSummary).score),
    },
  };
}

export function scoreQualify(layer: Layer, scoringState: SessionScoringState) {
  const currentScore = scoringState.lastScoreEvent?.quality_score ?? scoringState.baselineSummary.score;
  const threshold = layer === "silver" ? SILVER_THRESHOLD : GOLD_THRESHOLD;

  if (currentScore < threshold) {
    return createPenaltyEvent({
      actionType: "QUALIFY_GATE",
      raceEvent: layer === "silver" ? "FLAT_TYRE" : "ENGINE_DAMAGE",
      speedDelta: layer === "silver" ? -30 : -50,
      fuelDelta: -10,
      qualityScore: currentScore,
      rowsAffected: 0,
      rowsDropped: 0,
      penaltyReason: `Qualified to ${layer} below ${threshold}% quality.`,
      hudMessage: layer === "silver" ? "Silver gate failed — flat tyre" : "Gold gate failed — engine damage",
    });
  }

  if (layer === "gold" && currentScore === 100) {
    return {
      action_category: "A" as ActionCategory,
      action_type: "CLEAN_LAP" as ActionType,
      race_event: "CLEAN_LAP",
      speed_delta: 20,
      fuel_delta: 0,
      momentum_active: true,
      quality_score: currentScore,
      rows_affected: 0,
      rows_dropped: 0,
      locked_errors: [],
      penalty_reason: null,
      hud_message: "Perfect lap — gold qualification bonus",
      visual_cue: "CLEAN_LAP",
      qualify_readiness: buildQualifyReadiness(currentScore),
    };
  }

  return null;
}

export function createInitialScoringState(rows: TableRow[], columns: string[]): SessionScoringState {
  const baselineSummary = summarizeScore(rows, columns);
  return {
    currentSpeed: 240,
    currentFuel: 65,
    queryCount: 0,
    scanHistory: {},
    confirmedActions: [],
    confirmedSql: [],
    momentumActive: false,
    baselineSummary,
    lastScoreEvent: {
      action_category: "C",
      action_type: "SCAN_USEFUL",
      race_event: "GRID_READY",
      speed_delta: 0,
      fuel_delta: 0,
      momentum_active: false,
      quality_score: baselineSummary.score,
      rows_affected: 0,
      rows_dropped: 0,
      locked_errors: [],
      penalty_reason: null,
      hud_message: "Grid loaded — start cleaning",
      visual_cue: "GRID_READY",
      qualify_readiness: buildQualifyReadiness(baselineSummary.score),
    },
  };
}
