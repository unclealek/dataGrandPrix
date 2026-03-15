import { useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { Check, ChevronsLeftRight, Flag, History, RotateCcw, Undo2, X } from "lucide-react";
import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from "@supabase/supabase-js";
import { raceData, STARTER_SQL } from "./data";
import { supabase } from "./lib/supabase";
import type { Layer, QueryResponse, ScoreSummary, SessionState, TableRow, TableSnapshot } from "./types";

const layerOrder: Layer[] = ["bronze", "silver", "gold"];
const layerLabels: Record<Layer, string> = {
  bronze: "Bronze Table",
  silver: "Silver Table",
  gold: "Gold Table",
};

const initialColumns = raceData.columns;

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
  };
}

function cloneRows(rows: TableRow[]): TableRow[] {
  return rows.map((row) => ({ ...row }));
}

function summarizeScore(rows: TableRow[]): ScoreSummary {
  const normalizedRows = rows.map((row) => JSON.stringify(row));
  const duplicateRows = normalizedRows.length - new Set(normalizedRows).size;
  let nullCells = 0;
  let malformedEmails = 0;

  for (const row of rows) {
    for (const value of Object.values(row)) {
      if (value === null || value === "") {
        nullCells += 1;
      }
    }

    const email = String(row.email ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      malformedEmails += 1;
    }
  }

  const penalty = duplicateRows * 8 + nullCells * 2 + malformedEmails * 4;
  return {
    score: Math.max(0, 100 - penalty),
    duplicateRows,
    nullCells,
    malformedEmails,
  };
}

export default function App() {
  const [session, setSession] = useState<SessionState>(createInitialSession);
  const [sql, setSql] = useState(STARTER_SQL);
  const [editorMode, setEditorMode] = useState<"monaco" | "plain">("monaco");
  const [isRunning, setIsRunning] = useState(false);
  const [isQualifyOpen, setIsQualifyOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const activeLayer = session.activeLayer;
  const activeState = session.layerState[activeLayer];
  const currentVersion = activeState.history[activeState.currentIndex] ?? null;

  const qualifyTargets = layerOrder.filter((layer) => layerOrder.indexOf(layer) > layerOrder.indexOf(activeLayer));
  const scoreSummary = useMemo(() => summarizeScore(currentVersion?.rows ?? []), [currentVersion]);

  const telemetryStats = useMemo(() => {
    return [
      { label: "Active Layer", value: activeLayer.toUpperCase() },
      { label: "Seed", value: String(session.race.seed) },
      { label: "Confirmed Rows", value: String(currentVersion?.rowCount ?? 0) },
      { label: "Score", value: `${scoreSummary.score}` },
      { label: "History Nodes", value: String(activeState.history.length) },
    ];
  }, [activeLayer, activeState.history.length, currentVersion?.rowCount, scoreSummary.score, session.race.seed]);

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
      setMessage({
        type: "success",
        text: `Query executed successfully. ${data.rowCount ?? 0} rows returned.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Query execution failed.",
      });
    } finally {
      setIsRunning(false);
    }
  }

  function confirmPreview() {
    if (!session.previewState) {
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
      };
    });
    setMessage({ type: "success", text: "Preview confirmed into the active table." });
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
    setMessage({ type: "success", text: "Restored a previous confirmed state." });
  }

  function discardPreview() {
    setSession((prev) => ({ ...prev, previewState: null }));
    setMessage({ type: "success", text: "Preview discarded." });
  }

  function qualifyToLayer(targetLayer: Layer) {
    if (!currentVersion) {
      return;
    }

    setSession((prev) => {
      const promoted = createSnapshot(targetLayer, cloneRows(currentVersion.rows), 1, currentVersion.columns);
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
      };
    });
    setIsQualifyOpen(false);
    setMessage({ type: "success", text: `Qualified into ${layerLabels[targetLayer]}. Previous layer history is locked.` });
  }

  function resetGame() {
    setSession(createInitialSession());
    setSql(STARTER_SQL);
    setMessage({ type: "success", text: "Session reset to the Bronze starting grid." });
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
              <p className="eyebrow">Telemetry Cleaning Grid</p>
              <h1>Data Grand Prix</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <span className={`layer-pill layer-${activeLayer}`}>{layerLabels[activeLayer]}</span>
            <button className="reset-button" onClick={resetGame}>
              <RotateCcw size={18} />
              Reset
            </button>
          </div>
        </header>

        <div className="hazard-line" />

        <section className="panel telemetry-panel">
            <div className="section-header">
              <div>
                <p className="section-kicker">Telemetry</p>
                <h2>Current Cleaning Run</h2>
              </div>
            <div className="telemetry-stats">
              {telemetryStats.map((stat) => (
                <div key={stat.label} className="stat-card">
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
              ))}
            </div>
            </div>

            <div className="race-meta">
              <span>Race ID: {session.race.race_id}</span>
              <span>Schema: {session.race.schema_version}</span>
              <span>Source Table: {session.race.table_name}</span>
              <span>Duplicates: {scoreSummary.duplicateRows}</span>
              <span>Null Cells: {scoreSummary.nullCells}</span>
              <span>Bad Emails: {scoreSummary.malformedEmails}</span>
            </div>

          <div className="grid-panels">
            <div className="table-card">
              <div className="card-heading">
                <h3>{layerLabels[activeLayer].replace("Table", "Current")}</h3>
                <span>{currentVersion?.label ?? "No version"}</span>
              </div>
              <DataTable snapshot={currentVersion} emptyCopy="No confirmed table for this layer yet." />
            </div>

            <div className="panel-arrow">
              <ChevronsLeftRight size={34} />
            </div>

            <div className="table-card">
              <div className="card-heading">
                <h3>Applied Clean</h3>
                <span>{session.previewState ? "Preview ready" : "Awaiting run"}</span>
              </div>
              <DataTable snapshot={session.previewState} emptyCopy="Run SQL to generate a right-side preview." />
              <div className="preview-footer">
                {message && (
                  <div className={`feedback ${message.type}`}>
                    {message.type === "success" ? <Check size={16} /> : <X size={16} />}
                    <span>{message.text}</span>
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
            <button
              className={editorMode === "monaco" ? "editor-tab active" : "editor-tab"}
              onClick={() => setEditorMode("monaco")}
            >
              Monaco Run
            </button>
            <button
              className={editorMode === "plain" ? "editor-tab active" : "editor-tab"}
              onClick={() => setEditorMode("plain")}
            >
              Plain Editor
            </button>
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
            <button className="run-button" onClick={runQuery} disabled={isRunning}>
              {isRunning ? "Running..." : "Run"}
            </button>
          </div>
        </section>

        <section className="panel qualify-panel">
          <div>
            <p className="section-kicker">Promotion Gate</p>
            <h2>Qualify the Clean Data</h2>
            <p className="qualify-copy">
              Promote the current confirmed dataset upward. History stays isolated by layer and previous layers become inaccessible after qualification.
            </p>
          </div>
          <button className="qualify-button" onClick={() => setIsQualifyOpen(true)} disabled={qualifyTargets.length === 0}>
            Qualify
          </button>
        </section>
      </main>

      {isQualifyOpen && (
        <div className="modal-backdrop" onClick={() => setIsQualifyOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="section-kicker">Data Grand Prix</p>
                <h3>Qualify the Clean Data</h3>
              </div>
              <button className="close-button" onClick={() => setIsQualifyOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <p className="modal-copy">Select the table layer to qualify to:</p>
            <div className="layer-options">
              {layerOrder.map((layer) => {
                const isCurrent = layer === activeLayer;
                const allowed = qualifyTargets.includes(layer);
                return (
                  <button
                    key={layer}
                    className={allowed ? "layer-option" : "layer-option disabled"}
                    disabled={!allowed}
                    onClick={() => qualifyToLayer(layer)}
                  >
                    <span className="radio-dot" />
                    <span>{layerLabels[layer]}</span>
                    {isCurrent && <small>Current Level</small>}
                    {!isCurrent && !allowed && <small>Unavailable</small>}
                  </button>
                );
              })}
            </div>
            <p className="restriction-copy">
              Restriction: reverse and history access apply only within the currently active qualified layer.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function DataTable({
  snapshot,
  emptyCopy,
}: {
  snapshot: TableSnapshot | null;
  emptyCopy: string;
}) {
  if (!snapshot) {
    return <div className="table-empty">{emptyCopy}</div>;
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
