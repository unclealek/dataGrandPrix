export type Layer = "bronze" | "silver" | "gold";

export interface TableRow {
  [key: string]: string | number | null;
}

export interface TableSnapshot {
  versionId: string;
  label: string;
  columns: string[];
  rows: TableRow[];
  rowCount: number;
  createdAt: string;
}

export interface RaceDataset {
  race_id: string;
  seed: number;
  schema_version: string;
  table_name: string;
  columns: string[];
  row_count: number;
  rows: TableRow[];
}

export interface ScoreSummary {
  score: number;
  duplicateRows: number;
  nullCells: number;
  malformedEmails: number;
  cleanRows: number;
  originalNulls: number;
  filledNulls: number;
  originalDuplicates: number;
  deduped: number;
  correctTypes: number;
  totalColumns: number;
}

export type ActionCategory = "A" | "B" | "C" | "D";

export type ActionType =
  | "NULL_HANDLING"
  | "NORMALIZATION"
  | "SCHEMA_CAST"
  | "VALID_TRANSFORMATION"
  | "OUTLIER_HANDLING"
  | "DEDUPLICATION"
  | "CONDITIONAL_FIX"
  | "MOMENTUM_SETUP"
  | "SCAN_USEFUL"
  | "SCAN_REDUNDANT"
  | "CAUTION_FLAG"
  | "SPIN_OUT"
  | "TYRE_PUNCTURE"
  | "COLLISION"
  | "FUEL_WASTE"
  | "POSITION_LOST"
  | "PIT_STOP_WASTED"
  | "OVER_ENGINEERED"
  | "QUALIFY_GATE"
  | "CLEAN_LAP";

export interface QualifyReadiness {
  current_score: number;
  silver_threshold: number;
  gold_threshold: number;
  recommendation: "KEEP_CLEANING" | "READY_FOR_SILVER" | "READY_FOR_GOLD";
  projected_penalty: string | null;
}

export interface ScoreEvent {
  action_category: ActionCategory;
  action_type: ActionType;
  race_event: string;
  speed_delta: number;
  fuel_delta: number;
  momentum_active: boolean;
  quality_score: number;
  rows_affected: number;
  rows_dropped: number;
  locked_errors: string[];
  penalty_reason: string | null;
  hud_message: string;
  visual_cue: string;
  qualify_readiness: QualifyReadiness;
}

export interface QueryClassification {
  category: ActionCategory;
  actionType: ActionType;
  raceEvent: string;
  targetedColumns: string[];
}

export interface SessionScoringState {
  currentSpeed: number;
  currentFuel: number;
  queryCount: number;
  scanHistory: Record<string, number>;
  confirmedActions: ActionType[];
  confirmedSql: string[];
  momentumActive: boolean;
  baselineSummary: ScoreSummary;
  lastScoreEvent: ScoreEvent | null;
}

export interface LayerState {
  history: TableSnapshot[];
  currentIndex: number;
}

export interface SessionState {
  activeLayer: Layer;
  layerState: Record<Layer, LayerState>;
  previewState: TableSnapshot | null;
  race: RaceDataset;
  scoring: SessionScoringState;
}

export interface QueryResponse {
  success: boolean;
  columns?: string[];
  rows?: TableRow[];
  rowCount?: number;
  error?: string;
}

export interface RaceRecord {
  id: string;
  race_key: string;
  seed: number;
  schema_version: string;
  base_row_count: number;
}

export interface RaceSessionRecord {
  id: string;
  race_id: string;
  active_layer: Layer;
  current_score: number;
}
