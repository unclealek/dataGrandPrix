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

export interface LayerState {
  history: TableSnapshot[];
  currentIndex: number;
}

export interface SessionState {
  activeLayer: Layer;
  layerState: Record<Layer, LayerState>;
  previewState: TableSnapshot | null;
}

export interface QueryResponse {
  success: boolean;
  columns?: string[];
  rows?: TableRow[];
  rowCount?: number;
  error?: string;
}
