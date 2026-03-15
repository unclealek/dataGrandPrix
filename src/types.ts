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
