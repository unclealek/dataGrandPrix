import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { ArrowRight, CarFront, Check, Flag, History, Lock, RotateCcw, Trophy, Undo2, X, Zap } from "lucide-react";
import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from "@supabase/supabase-js";
import { raceData, STARTER_SQL } from "./data";
import { supabase } from "./lib/supabase";
import type {
  Layer,
  QueryResponse,
  RaceRecord,
  RaceSessionRecord,
  ScoreSummary,
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
  const [raceRecordId, setRaceRecordId] = useState<string | null>(null);
  const [raceSessionId, setRaceSessionId] = useState<string | null>(null);
  const [previewSuccessFlash, setPreviewSuccessFlash] = useState(false);
  const [selectedQualifyTarget, setSelectedQualifyTarget] = useState<Layer | null>(null);
  const [qualifyArmed, setQualifyArmed] = useState<Record<Layer, boolean>>({
    bronze: false,
    silver: false,
    gold: false,
  });

  const activeLayer = session.activeLayer;
  const activeState = session.layerState[activeLayer];
  const currentVersion = activeState.history[activeState.currentIndex] ?? null;

  const qualifyTargets = layerOrder.filter((layer) => layerOrder.indexOf(layer) > layerOrder.indexOf(activeLayer));
  const scoreSummary = useMemo(() => summarizeScore(currentVersion?.rows ?? []), [currentVersion]);
  const shouldPulseQualify = qualifyTargets.length > 0 && qualifyArmed[activeLayer];

  const telemetryStats = useMemo(() => {
    return [
      { label: "Active Layer", value: activeLayer.toUpperCase() },
      { label: "Seed", value: String(session.race.seed) },
      { label: "Confirmed Rows", value: String(currentVersion?.rowCount ?? 0) },
      { label: "Score", value: `${scoreSummary.score}` },
      { label: "History Nodes", value: String(activeState.history.length) },
    ];
  }, [activeLayer, activeState.history.length, currentVersion?.rowCount, scoreSummary.score, session.race.seed]);

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

      const previewScore = summarizeScore(data.rows);

      if (supabase && raceSessionId) {
        const { error: attemptError } = await supabase.from("sql_attempts").insert({
          session_id: raceSessionId,
          layer: activeLayer,
          version_number: activeState.currentIndex + 1,
          sql_text: sql,
          preview_row_count: data.rowCount ?? 0,
          score_after: previewScore.score,
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
      setMessage({
        type: "success",
        text: `Query executed successfully. ${data.rowCount ?? 0} rows returned.`,
      });
      setPreviewSuccessFlash(true);
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
    setSelectedQualifyTarget(null);
    setMessage({ type: "success", text: `Qualified into ${layerLabels[targetLayer]}. Previous layer history is locked.` });
    setQualifyArmed((prev) => ({ ...prev, [targetLayer]: false }));
  }

  function resetGame() {
    setSession(createInitialSession());
    setSql(STARTER_SQL);
    setMessage({ type: "success", text: "Session reset to the Bronze starting grid." });
    setQualifyArmed({ bronze: false, silver: false, gold: false });
    setPreviewSuccessFlash(false);
    setSelectedQualifyTarget(null);
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
              <span>Race Row: {raceRecordId ?? "Pending"}</span>
              <span>Session Row: {raceSessionId ?? "Pending"}</span>
              <span>Duplicates: {scoreSummary.duplicateRows}</span>
              <span>Null Cells: {scoreSummary.nullCells}</span>
              <span>Bad Emails: {scoreSummary.malformedEmails}</span>
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
              <CarFront size={16} />
              {isRunning ? "Running..." : "Run"}
            </button>
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
              Select the table layer to qualify the current dataset to. This will lock current history and start a new state tracking for the selected layer.
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
