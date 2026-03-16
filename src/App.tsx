import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { ArrowRight, Check, Flag, History, Lock, RotateCcw, Trophy, Undo2, X, Zap } from "lucide-react";
import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from "@supabase/supabase-js";
import { raceData, STARTER_SQL } from "./data";
import { applyConfirmedScore, createInitialScoringState, scorePreview, scoreQualify, summarizeScore } from "./lib/scoring";
import { RaceOverlay } from "./liveRace/RaceOverlay";
import { supabase } from "./lib/supabase";
import type {
  Layer,
  QueryResponse,
  RaceRecord,
  RaceSessionRecord,
  ScoreSummary,
  ScoreEvent,
  SessionState,
  TableRow,
  TableSnapshot,
} from "./types";

const layerOrder: Layer[] = ["bronze", "silver", "gold"];
const layerLabels: Record<Layer, string> = {
  bronze: "Bronze Table",
  silver: "Silver Table",
  gold: "Gold Table",
};

const initialColumns = raceData.columns;
const layerTheme: Record<Layer, { color: string; accentClass: string }> = {
  bronze: { color: "#CD7F32", accentClass: "tier-bronze" },
  silver: { color: "#C0C0C0", accentClass: "tier-silver" },
  gold: { color: "#FFD700", accentClass: "tier-gold" },
};

const queryPresets = [
  {
    label: "Normalization",
    icon: "🏎️",
    sql: `SELECT
  id,
  first_name,
  last_name,
  email,
  CASE LOWER(TRIM(country))
    WHEN 'usa' THEN 'USA'
    WHEN 'united states' THEN 'USA'
    WHEN 'uk' THEN 'United Kingdom'
    WHEN 'united kingdom' THEN 'United Kingdom'
    WHEN 'canada' THEN 'Canada'
    WHEN 'australia' THEN 'Australia'
    WHEN 'new zealand' THEN 'New Zealand'
    ELSE country
  END AS country,
  signup_date,
  amount,
  LOWER(TRIM(status)) AS status
FROM current_table;`,
  },
  {
    label: "Amount Clean",
    icon: "🏎️",
    sql: `SELECT
  id,
  first_name,
  last_name,
  email,
  country,
  signup_date,
  CASE
    WHEN amount IS NULL OR TRIM(amount) = '' THEN amount
    WHEN TRIM(amount) LIKE '$%,%.%'
      THEN substr(substr(TRIM(amount), 2), 1, instr(substr(TRIM(amount), 2), ',') - 1)
           || substr(substr(TRIM(amount), 2), instr(substr(TRIM(amount), 2), ',') + 1)
    WHEN TRIM(amount) LIKE '%,%.%'
      THEN substr(TRIM(amount), 1, instr(TRIM(amount), ',') - 1)
           || substr(TRIM(amount), instr(TRIM(amount), ',') + 1)
    WHEN TRIM(amount) LIKE '$%'
      THEN substr(TRIM(amount), 2)
    ELSE TRIM(amount)
  END AS amount,
  status
FROM current_table;`,
  },
  {
    label: "Email Repair",
    icon: "🏎️",
    sql: `SELECT
  id,
  TRIM(first_name) AS first_name,
  TRIM(last_name) AS last_name,
  CASE
    WHEN LOWER(TRIM(email)) LIKE '%_@_%._%' THEN LOWER(TRIM(email))
    ELSE LOWER(TRIM(first_name)) || '.' || LOWER(TRIM(last_name)) || '@email.com'
  END AS email,
  country,
  signup_date,
  amount,
  status
FROM current_table;`,
  },
  {
    label: "Date Format",
    icon: "🏎️",
    sql: `SELECT
  id,
  first_name,
  last_name,
  email,
  country,
  CASE
    WHEN signup_date LIKE '__/__/____'
      THEN substr(signup_date, 7, 4) || '-' || substr(signup_date, 1, 2) || '-' || substr(signup_date, 4, 2)
    ELSE TRIM(signup_date)
  END AS signup_date,
  amount,
  status
FROM current_table;`,
  },
  {
    label: "Fill Amount",
    icon: "🏎️",
    sql: `SELECT
  id,
  first_name,
  last_name,
  email,
  country,
  signup_date,
  COALESCE(amount, '0') AS amount,
  status
FROM current_table;`,
  },
  {
    label: "Fill First Name",
    icon: "🏎️",
    sql: `SELECT
  id,
  COALESCE(first_name, 'unknown') AS first_name,
  last_name,
  email,
  country,
  signup_date,
  amount,
  status
FROM current_table;`,
  },
  {
    label: "Fill Country",
    icon: "🏎️",
    sql: `SELECT
  id,
  first_name,
  last_name,
  email,
  COALESCE(country, 'USA') AS country,
  signup_date,
  amount,
  status
FROM current_table;`,
  },
];

function createSnapshot(layer: Layer, rows: TableRow[], version: number, columns = initialColumns): TableSnapshot {
  return {
    versionId: `${layer}-${version}-${Date.now()}`,
    label: `${layerLabels[layer].replace(" Table", "")} v${version}`,
    columns,
    rows,
    rowCount: rows.length,
    createdAt: new Date().toISOString(),
  };
}

function createInitialSession(): SessionState {
  const bronzeBase = createSnapshot("bronze", raceData.rows, 1, raceData.columns);

  return {
    activeLayer: "bronze",
    layerState: {
      bronze: { history: [bronzeBase], currentIndex: 0 },
      silver: { history: [], currentIndex: -1 },
      gold: { history: [], currentIndex: -1 },
    },
    previewState: null,
    race: raceData,
    scoring: createInitialScoringState(raceData.rows, raceData.columns),
  };
}

function cloneRows(rows: TableRow[]): TableRow[] {
  return rows.map((row) => ({ ...row }));
}

export default function App() {
  const [session, setSession] = useState<SessionState>(createInitialSession);
  const [sql, setSql] = useState(STARTER_SQL);
  const [editorMode, setEditorMode] = useState<"monaco" | "plain">("monaco");
  const [isRunning, setIsRunning] = useState(false);
  const [isQualifyOpen, setIsQualifyOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [raceRecordId, setRaceRecordId] = useState<string | null>(null);
  const [raceSessionId, setRaceSessionId] = useState<string | null>(null);
  const [previewSuccessFlash, setPreviewSuccessFlash] = useState(false);
  const [selectedQualifyTarget, setSelectedQualifyTarget] = useState<Layer | null>(null);
  const [pendingScoreEvent, setPendingScoreEvent] = useState<ScoreEvent | null>(null);
  const [qualifyArmed, setQualifyArmed] = useState<Record<Layer, boolean>>({
    bronze: false,
    silver: false,
    gold: false,
  });

  const activeLayer = session.activeLayer;
  const activeState = session.layerState[activeLayer];
  const currentVersion = activeState.history[activeState.currentIndex] ?? null;

  const qualifyTargets = layerOrder.filter((layer) => layerOrder.indexOf(layer) > layerOrder.indexOf(activeLayer));
  const scoreSummary = useMemo<ScoreSummary>(
    () =>
      summarizeScore(
        currentVersion?.rows ?? [],
        currentVersion?.columns ?? raceData.columns,
        session.scoring.baselineSummary,
      ),
    [currentVersion, session.scoring.baselineSummary],
  );
  const shouldPulseQualify = qualifyTargets.length > 0 && qualifyArmed[activeLayer];
  const activeScoreEvent = pendingScoreEvent ?? session.scoring.lastScoreEvent;
  const liveRaceMessage =
    activeScoreEvent?.hud_message ??
    (session.scoring.currentSpeed < 180
      ? "The car is crawling. Clean the data to unlock pace."
      : session.scoring.currentSpeed < 240
        ? "Building pace through the field."
        : "Full race rhythm. Keep the queries sharp.");

  const telemetryStats = useMemo(() => {
    return [
      { label: "Active Layer", value: activeLayer.toUpperCase() },
      { label: "Seed", value: String(session.race.seed) },
      { label: "Confirmed Rows", value: String(currentVersion?.rowCount ?? 0) },
      { label: "Quality", value: `${scoreSummary.score}` },
      { label: "Speed", value: `${session.scoring.currentSpeed}` },
      { label: "Fuel", value: `${session.scoring.currentFuel}` },
      { label: "History Nodes", value: String(activeState.history.length) },
    ];
  }, [
    activeLayer,
    activeState.history.length,
    currentVersion?.rowCount,
    scoreSummary.score,
    session.race.seed,
    session.scoring.currentFuel,
    session.scoring.currentSpeed,
  ]);

  const statusText = session.previewState ? "Ready to confirm" : isRunning ? "Executing" : "Racing";

  useEffect(() => {
    if (!supabase || raceSessionId) {
      return;
    }

    const client = supabase;
    let cancelled = false;

    async function ensurePersistence() {
      const { data: existingRace, error: raceLookupError } = await client
        .from("races")
        .select("id, race_key, seed, schema_version, base_row_count")
        .eq("race_key", session.race.race_id)
        .maybeSingle<RaceRecord>();

      if (raceLookupError) {
        if (!cancelled) {
          setMessage({ type: "error", text: raceLookupError.message });
        }
        return;
      }

      let raceId = existingRace?.id ?? null;

      if (!raceId) {
        const { data: createdRace, error: createRaceError } = await client
          .from("races")
          .insert({
            race_key: session.race.race_id,
            seed: session.race.seed,
            schema_version: session.race.schema_version,
            base_row_count: session.race.row_count,
          })
          .select("id, race_key, seed, schema_version, base_row_count")
          .single<RaceRecord>();

        if (createRaceError) {
          if (!cancelled) {
            setMessage({ type: "error", text: createRaceError.message });
          }
          return;
        }

        raceId = createdRace.id;
      }

      const { data: createdSession, error: createSessionError } = await client
        .from("race_sessions")
          .insert({
            race_id: raceId,
            active_layer: session.activeLayer,
            current_score: scoreSummary.score,
        })
        .select("id, race_id, active_layer, current_score")
        .single<RaceSessionRecord>();

      if (createSessionError) {
        if (!cancelled) {
          setMessage({ type: "error", text: createSessionError.message });
        }
        return;
      }

      if (!cancelled) {
        setRaceRecordId(raceId);
        setRaceSessionId(createdSession.id);
      }
    }

    ensurePersistence();

    return () => {
      cancelled = true;
    };
  }, [raceSessionId, scoreSummary.score, session.activeLayer, session.race.race_id, session.race.row_count, session.race.schema_version, session.race.seed]);

  useEffect(() => {
    if (!supabase || !raceSessionId) {
      return;
    }

    const client = supabase;

    void client
      .from("race_sessions")
      .update({
        active_layer: session.activeLayer,
        current_score: scoreSummary.score,
        updated_at: new Date().toISOString(),
      })
      .eq("id", raceSessionId);
  }, [raceSessionId, scoreSummary.score, session.activeLayer]);

  useEffect(() => {
    if (!previewSuccessFlash) {
      return;
    }

    const timeoutId = window.setTimeout(() => setPreviewSuccessFlash(false), 800);
    return () => window.clearTimeout(timeoutId);
  }, [previewSuccessFlash]);

  async function runQuery() {
    if (!currentVersion) {
      return;
    }

    setIsRunning(true);
    setMessage(null);

    try {
      if (!supabase) {
        throw new Error("Missing Supabase environment variables.");
      }

      const { data, error } = await supabase.functions.invoke<QueryResponse>("execute-query", {
        body: {
          sql,
          currentData: {
            columns: currentVersion.columns,
            rows: currentVersion.rows,
          },
        },
      });

      if (error) {
        if (error instanceof FunctionsHttpError) {
          const response = await error.context.json().catch(() => null);
          throw new Error(response?.error ?? error.message);
        }
        if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) {
          throw new Error(error.message);
        }
        throw new Error(error.message);
      }

      if (!data?.success || !data.columns || !data.rows) {
        throw new Error(data?.error ?? "Query failed.");
      }

      const previewScore = scorePreview({
        sql,
        previousRows: currentVersion.rows,
        previousColumns: currentVersion.columns,
        nextRows: data.rows,
        nextColumns: data.columns,
        scoringState: session.scoring,
        executionSuccess: true,
        errorMessage: null,
      });

      if (supabase && raceSessionId) {
        const { error: attemptError } = await supabase.from("sql_attempts").insert({
          session_id: raceSessionId,
          layer: activeLayer,
          version_number: activeState.currentIndex + 1,
          sql_text: sql,
          preview_row_count: data.rowCount ?? 0,
          score_after: previewScore.quality_score,
        });

        if (attemptError) {
          throw new Error(attemptError.message);
        }
      }

      setSession((prev) => ({
        ...prev,
        previewState: {
          versionId: `preview-${Date.now()}`,
          label: "Preview Result",
          columns: data.columns ?? [],
          rows: data.rows ?? [],
          rowCount: data.rowCount ?? 0,
          createdAt: new Date().toISOString(),
        },
      }));
      setPendingScoreEvent(previewScore);
      setMessage({
        type: "success",
        text: `${previewScore.hud_message} ${data.rowCount ?? 0} rows returned.`,
      });
      setPreviewSuccessFlash(true);
    } catch (error) {
      const failureScore = scorePreview({
        sql,
        previousRows: currentVersion.rows,
        previousColumns: currentVersion.columns,
        nextRows: currentVersion.rows,
        nextColumns: currentVersion.columns,
        scoringState: session.scoring,
        executionSuccess: false,
        errorMessage: error instanceof Error ? error.message : "Query execution failed.",
      });
      setPendingScoreEvent(failureScore);
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Query execution failed.",
      });
    } finally {
      setIsRunning(false);
    }
  }

  function confirmPreview() {
    if (!session.previewState || !pendingScoreEvent) {
      return;
    }

    setSession((prev) => {
      const currentLayerState = prev.layerState[prev.activeLayer];
      const nextVersionNumber = currentLayerState.history.length + 1;
      const confirmedSnapshot = createSnapshot(
        prev.activeLayer,
        cloneRows(prev.previewState!.rows),
        nextVersionNumber,
        prev.previewState!.columns,
      );

      const nextHistory = [...currentLayerState.history, confirmedSnapshot];
      const nextScoring = applyConfirmedScore(
        prev.scoring,
        pendingScoreEvent,
        sql,
        confirmedSnapshot.rows,
        confirmedSnapshot.columns,
      );

      return {
        ...prev,
        layerState: {
          ...prev.layerState,
          [prev.activeLayer]: {
            history: nextHistory,
            currentIndex: nextHistory.length - 1,
          },
        },
        previewState: null,
        scoring: nextScoring,
      };
    });
    setPendingScoreEvent(null);
    setMessage({ type: "success", text: `${pendingScoreEvent.hud_message} Preview confirmed into the active table.` });
    setQualifyArmed((prev) => ({ ...prev, [activeLayer]: true }));
  }

  function reverseCurrentLayer() {
    if (activeState.currentIndex <= 0) {
      return;
    }

    setSession((prev) => ({
      ...prev,
      layerState: {
        ...prev.layerState,
        [prev.activeLayer]: {
          ...prev.layerState[prev.activeLayer],
          currentIndex: prev.layerState[prev.activeLayer].currentIndex - 1,
        },
      },
      previewState: null,
    }));
    setPendingScoreEvent(null);
    setMessage({ type: "success", text: "Moved back one confirmed version in this layer." });
  }

  function restoreVersion(index: number) {
    setSession((prev) => ({
      ...prev,
      layerState: {
        ...prev.layerState,
        [prev.activeLayer]: {
          ...prev.layerState[prev.activeLayer],
          currentIndex: index,
        },
      },
      previewState: null,
    }));
    setPendingScoreEvent(null);
    setMessage({ type: "success", text: "Restored a previous confirmed state." });
  }

  function discardPreview() {
    setSession((prev) => ({ ...prev, previewState: null }));
    setPendingScoreEvent(null);
    setMessage({ type: "success", text: "Preview discarded." });
  }

  function qualifyToLayer(targetLayer: Layer) {
    if (!currentVersion) {
      return;
    }

    const qualifyEvent = scoreQualify(targetLayer, session.scoring);
    if (qualifyEvent?.action_category === "D") {
      setSession((prev) => ({
        ...prev,
        scoring: {
          ...prev.scoring,
          currentSpeed: Math.max(0, prev.scoring.currentSpeed + qualifyEvent.speed_delta),
          currentFuel: Math.max(0, prev.scoring.currentFuel + qualifyEvent.fuel_delta),
          lastScoreEvent: qualifyEvent,
        },
      }));
      setPendingScoreEvent(null);
      setMessage({ type: "error", text: qualifyEvent.hud_message });
      setIsQualifyOpen(false);
      return;
    }

    setSession((prev) => {
      const promoted = createSnapshot(targetLayer, cloneRows(currentVersion.rows), 1, currentVersion.columns);
      const qualifyReadiness =
        qualifyEvent?.qualify_readiness ?? {
          current_score: scoreSummary.score,
          silver_threshold: 85,
          gold_threshold: 92,
          recommendation: "KEEP_CLEANING",
          projected_penalty: null,
        };

      return {
        ...prev,
        activeLayer: targetLayer,
        layerState: {
          ...prev.layerState,
          [targetLayer]: {
            history: [promoted],
            currentIndex: 0,
          },
        },
        previewState: null,
        scoring: {
          ...prev.scoring,
          currentSpeed: Math.max(0, prev.scoring.currentSpeed + (qualifyEvent?.speed_delta ?? 0)),
          currentFuel: Math.max(0, prev.scoring.currentFuel + (qualifyEvent?.fuel_delta ?? 0)),
          lastScoreEvent: {
            ...(qualifyEvent ??
              prev.scoring.lastScoreEvent ?? {
              action_category: "A",
              action_type: "VALID_TRANSFORMATION",
              race_event: "QUALIFIED",
              speed_delta: 0,
              fuel_delta: 0,
              momentum_active: false,
              quality_score: scoreSummary.score,
              rows_affected: 0,
              rows_dropped: 0,
              locked_errors: [],
              penalty_reason: null,
              hud_message: "Qualified successfully",
              visual_cue: "QUALIFIED",
              qualify_readiness: qualifyReadiness,
            }),
            quality_score: qualifyEvent?.quality_score ?? scoreSummary.score,
            hud_message:
              qualifyEvent?.action_type === "CLEAN_LAP"
                ? `${qualifyEvent.hud_message} Qualified into ${layerLabels[targetLayer]}.`
                : `Qualified into ${layerLabels[targetLayer]}.`,
            visual_cue: qualifyEvent?.visual_cue ?? "QUALIFIED",
            qualify_readiness: qualifyReadiness,
          },
        },
      };
    });
    setIsQualifyOpen(false);
    setSelectedQualifyTarget(null);
    setMessage({
      type: "success",
      text:
        qualifyEvent?.action_type === "CLEAN_LAP"
          ? `${qualifyEvent.hud_message} Qualified into ${layerLabels[targetLayer]}. Previous layer history is locked.`
          : `Qualified into ${layerLabels[targetLayer]}. Previous layer history is locked.`,
    });
    setQualifyArmed((prev) => ({ ...prev, [targetLayer]: false }));
    setPendingScoreEvent(null);
  }

  function resetGame() {
    setSession(createInitialSession());
    setSql(STARTER_SQL);
    setMessage({ type: "success", text: "Session reset to the Bronze starting grid." });
    setQualifyArmed({ bronze: false, silver: false, gold: false });
    setPreviewSuccessFlash(false);
    setSelectedQualifyTarget(null);
    setPendingScoreEvent(null);
  }

  return (
    <div className="page-shell">
      <div className="atlas-noise" />
      <main className="console">
        <header className="topbar">
          <div className="brand-wrap">
            <div className="brand-mark">
              <Flag size={18} />
            </div>
            <div>
              <p className="eyebrow">SQL Cleaning Dashboard v1.0.4</p>
              <h1>Data Grand Prix</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="status-cluster">
              <div className="status-pill">
                <span>Current Layer</span>
                <strong className={`layer-${activeLayer}`}>{activeLayer.toUpperCase()}</strong>
              </div>
              <div className="status-pill">
                <span>Status</span>
                <strong className={message?.type === "error" ? "status-error" : "status-live"}>{statusText}</strong>
              </div>
            </div>
            <button className="reset-button" onClick={resetGame}>
              <RotateCcw size={18} />
              Reset Session
            </button>
          </div>
        </header>

        <div className="hazard-line" />

        <section className="panel telemetry-panel">
          <div className="section-header telemetry-header">
            <div>
              <p className="section-kicker">Telemetry</p>
              <h2>Current Cleaning Run</h2>
            </div>
          </div>

          <div className="telemetry-stats">
            {telemetryStats.map((stat) => (
              <div key={stat.label} className="stat-card">
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>

          <div className="race-meta">
            <span>Race ID: {session.race.race_id}</span>
            <span>Schema: {session.race.schema_version}</span>
            <span>Source Table: {session.race.table_name}</span>
            <span>Race Row: {raceRecordId ?? "Pending"}</span>
            <span>Session Row: {raceSessionId ?? "Pending"}</span>
            <span>Duplicates: {scoreSummary.duplicateRows}</span>
            <span>Null Cells: {scoreSummary.nullCells}</span>
            <span>Bad Emails: {scoreSummary.malformedEmails}</span>
            <span>Clean Rows: {scoreSummary.cleanRows}</span>
            <span>Action: {activeScoreEvent?.action_type ?? "NONE"}</span>
            <span>Event: {activeScoreEvent?.race_event ?? "GRID_READY"}</span>
          </div>

          <div className="telemetry-signal-banner">
            <span className="telemetry-signal-label">Current Signal</span>
            <p className="telemetry-signal-copy">{liveRaceMessage}</p>
          </div>

          <div className="telemetry-layout">
            <RaceOverlay
              scoringState={session.scoring}
              lastScoreEvent={session.scoring.lastScoreEvent}
              defaultSessionKey={9472}
              width={860}
              height={540}
            />
          </div>

          <div className="grid-panels">
            <div className="source-section">
              <div className="section-subhead">
                <div>
                  <p className="section-kicker">Source Grid</p>
                  <h3>{layerLabels[activeLayer].replace("Table", "Current")}</h3>
                </div>
                <span>{currentVersion?.label ?? "No version"}</span>
              </div>
              <div className="table-card source-table-card">
                <DataTable snapshot={currentVersion} emptyCopy="No confirmed table for this layer yet." emptyMode="table" />
              </div>
            </div>

            <div className="executed-run-section">
              <div className="section-subhead executed-run-head">
                <div>
                  <p className="section-kicker">Executed Run</p>
                  <h3>Applied Clean</h3>
                </div>
                <span>{session.previewState ? "Preview ready" : "Awaiting run"}</span>
              </div>
              <div className={`table-card applied-clean-card${previewSuccessFlash ? " success-flash" : ""}`}>
                <div className="card-heading">
                  <h3>Execution Output</h3>
                  <span>{session.previewState ? "Latest SQL result" : "Run SQL to populate"}</span>
                </div>
                <DataTable snapshot={session.previewState} emptyCopy="Run SQL to generate a right-side preview." emptyMode="message" />
                <div className="preview-footer">
                  {message && (
                    <div className={`feedback ${message.type}`}>
                      {message.type === "success" ? <Check size={16} /> : <X size={16} />}
                      <span>{message.text}</span>
                    </div>
                  )}
                  {activeScoreEvent && (
                    <div className="feedback success">
                      <Zap size={16} />
                      <span>
                        {activeScoreEvent.action_type} | speed {activeScoreEvent.speed_delta >= 0 ? "+" : ""}
                        {activeScoreEvent.speed_delta} | fuel {activeScoreEvent.fuel_delta} | quality{" "}
                        {activeScoreEvent.quality_score}
                      </span>
                    </div>
                  )}
                  <div className="preview-actions">
                    <button className="gold-button" onClick={confirmPreview} disabled={!session.previewState}>
                      Confirm
                    </button>
                    <button className="steel-button" onClick={reverseCurrentLayer} disabled={activeState.currentIndex <= 0}>
                      <Undo2 size={16} />
                      Reverse
                    </button>
                    <button className="ghost-button" onClick={discardPreview} disabled={!session.previewState}>
                      Discard
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="history-strip">
            <div className="history-label">
              <History size={16} />
              <span>{layerLabels[activeLayer]} History</span>
            </div>
            <div className="history-list">
              {activeState.history.map((version, index) => (
                <button
                  key={version.versionId}
                  className={index === activeState.currentIndex ? "history-chip active" : "history-chip"}
                  onClick={() => restoreVersion(index)}
                >
                  {version.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel editor-panel">
          <div className="editor-tabs">
            <div className="editor-tab-list">
              <button
                className={editorMode === "monaco" ? "editor-tab active" : "editor-tab"}
                onClick={() => setEditorMode("monaco")}
              >
                MONACO RUN
              </button>
              <button
                className={editorMode === "plain" ? "editor-tab active" : "editor-tab"}
                onClick={() => setEditorMode("plain")}
              >
                PLAIN EDITOR
              </button>
            </div>
            <button className="run-button editor-tab-run" onClick={runQuery} disabled={isRunning}>
              <span aria-hidden="true">🏎️</span>
              {isRunning ? "Running..." : "Run"}
            </button>
          </div>

          <div className="query-preset-strip">
            {queryPresets.map((preset) => (
              <button
                key={preset.label}
                className="query-preset-button"
                onClick={() => setSql(preset.sql)}
              >
                <span aria-hidden="true">{preset.icon}</span>
                {preset.label}
              </button>
            ))}
          </div>

          <div className="editor-frame">
            {editorMode === "monaco" ? (
              <Editor
                height="320px"
                defaultLanguage="sql"
                value={sql}
                onChange={(value) => setSql(value ?? "")}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 18,
                  lineNumbersMinChars: 3,
                  padding: { top: 20, bottom: 16 },
                  scrollBeyondLastLine: false,
                }}
              />
            ) : (
              <textarea className="plain-editor" value={sql} onChange={(event) => setSql(event.target.value)} />
            )}
          </div>

          <div className="editor-footer">
            <div className="editor-hint">Run against the current confirmed table only. Confirm when the preview looks race-ready.</div>
          </div>
        </section>

        <section className="panel qualify-panel">
          <div className="qualify-panel-copy">
            <p className="section-kicker">Advance the Race</p>
            <h2>Qualify the Clean Data</h2>
            <p className="qualify-copy">
              Promote the current confirmed dataset upward. History stays isolated by layer and previous layers become inaccessible after qualification.
            </p>
          </div>
            <button
              className={shouldPulseQualify ? "qualify-button qualify-ready" : "qualify-button"}
            onClick={() => {
              setSelectedQualifyTarget(qualifyTargets[0] ?? null);
              setIsQualifyOpen(true);
            }}
            disabled={qualifyTargets.length === 0}
          >
            <Trophy size={18} />
            Qualify Data
            <ArrowRight size={18} />
          </button>
        </section>

        <footer className="app-footer">
          <div className="footer-stat">
            <span>Active Database</span>
            <strong>{session.race.table_name.toUpperCase()}</strong>
          </div>
          <div className="footer-stat">
            <span>Latency</span>
            <strong className="status-live">{isRunning ? "RUNNING" : "0.42 MS"}</strong>
          </div>
          <div className="footer-stat footer-credit">
            <span>Built for data engineers by Blink Engineer</span>
          </div>
        </footer>
      </main>

      {isQualifyOpen && (
        <div className="modal-backdrop" onClick={() => setIsQualifyOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title-wrap">
                <Trophy size={18} />
                <h3>Qualify the Clean Data</h3>
              </div>
              <button className="close-button" onClick={() => setIsQualifyOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <p className="modal-copy">
              Select the table layer to qualify the current dataset to. Silver needs {activeScoreEvent?.qualify_readiness.silver_threshold ?? 85}% quality and Gold needs {activeScoreEvent?.qualify_readiness.gold_threshold ?? 92}%.
            </p>
            <div className="layer-options">
              {layerOrder.map((layer) => {
                const isCurrent = layer === activeLayer;
                const allowed = qualifyTargets.includes(layer);
                const theme = layerTheme[layer];
                return (
                  <button
                    key={layer}
                    className={`layer-option ${theme.accentClass}${allowed ? "" : " disabled"}${isCurrent ? " current" : ""}${
                      selectedQualifyTarget === layer ? " selected" : ""
                    }`}
                    disabled={!allowed}
                    onClick={() => setSelectedQualifyTarget(layer)}
                  >
                    <span className="layer-option-radio" aria-hidden="true" />
                    <span className="layer-option-title">
                      <strong style={{ color: theme.color }}>{layerLabels[layer]}</strong>
                      <small>{isCurrent ? "Current level" : allowed ? "Promotion available" : "Unavailable from current layer"}</small>
                    </span>
                    <span className="layer-option-end">
                      {isCurrent ? (
                        <small>Current Level</small>
                      ) : !allowed ? (
                        <Lock size={15} />
                      ) : (
                        <span className="layer-option-badge" style={{ color: theme.color, borderColor: `${theme.color}55` }}>
                          {layer.toUpperCase()}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="restriction-banner">
              <Zap size={16} />
              <p className="restriction-copy">
                <strong>Restrictions:</strong> You can only reverse operations within the qualified table layer. You cannot go backward once you select a higher layer.
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="modal-qualify-button"
                onClick={() => selectedQualifyTarget && qualifyToLayer(selectedQualifyTarget)}
                disabled={!selectedQualifyTarget}
              >
                Proceed to {selectedQualifyTarget ? selectedQualifyTarget.toUpperCase() : "NEXT"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function DataTable({
  snapshot,
  emptyCopy,
  emptyMode = "table",
}: {
  snapshot: TableSnapshot | null;
  emptyCopy: string;
  emptyMode?: "table" | "message";
}) {
  if (!snapshot) {
    if (emptyMode === "message") {
      return <div className="table-empty table-empty-message">{emptyCopy}</div>;
    }

    return (
      <div className="table-empty">
        <div className="table-empty-copy">{emptyCopy}</div>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {snapshot.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {snapshot.rows.slice(0, 8).map((row, index) => (
            <tr key={`${snapshot.versionId}-${index}`}>
              {snapshot.columns.map((column) => (
                <td key={`${snapshot.versionId}-${index}-${column}`}>{String(row[column] ?? "NULL")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="table-caption">{snapshot.rowCount} rows in result</div>
    </div>
  );
}
