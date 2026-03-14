import React, { useState, useEffect } from 'react';
import DatasetViewer from './components/DatasetViewer';
import SQLEditor from './components/SQLEditor';
import QualityScorePanel from './components/QualityScorePanel';
import RaceReplay from './components/RaceReplay';
import Leaderboard from './components/Leaderboard';
import { Database, Zap, RefreshCw } from 'lucide-react';

const API_URL = '/api';

function App() {
  const [activeTable, setActiveTable] = useState('bronze');
  const [dataset, setDataset] = useState([]);
  const [datasetTitle, setDatasetTitle] = useState('Table: bronze');
  const [scorecard, setScorecard] = useState(null);
  const [raceResults, setRaceResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchDataset = async (table) => {
    try {
      const res = await fetch(`${API_URL}/dataset?table=${table}`);
      if (!res.ok) {
        return false;
      }
      const data = await res.json();
      setDataset(data.data);
      setActiveTable(table);
      setDatasetTitle(`Table: ${table}`);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  useEffect(() => {
    fetchDataset('bronze');
  }, []);

  const loadBestAvailableTable = async () => {
    const candidates = ['gold', 'silver', 'bronze'];
    for (const table of candidates) {
      const loaded = await fetchDataset(table);
      if (loaded) return;
    }
  };

  const handleRunQuery = async (query) => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_URL}/run-sql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.detail || 'Query failed');
      } else {
        if (data.result.kind === 'rows') {
          setDataset(data.result.rows);
          setActiveTable('query');
          setDatasetTitle('Ad hoc query result');
        } else {
          await loadBestAvailableTable();
        }
        await evaluateScore();
      }
    } catch {
      setErrorMsg('Failed to run query. Check console.');
    } finally {
      setIsLoading(false);
    }
  };

  const evaluateScore = async () => {
    try {
      const res = await fetch(`${API_URL}/score-data`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setScorecard(data.scorecard);
        return data.scorecard;
      } else {
        setScorecard(null);
        return null;
      }
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  const handleRunRace = async () => {
    try {
      const res = await fetch(`${API_URL}/run-race`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        setScorecard(data.scorecard);
        setRaceResults(data.race_results);
      } else {
        setErrorMsg(data.detail || 'Race simulation failed');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReset = async () => {
    try {
      await fetch(`${API_URL}/reset`, { method: 'POST' });
      setScorecard(null);
      setRaceResults(null);
      setErrorMsg('');
      setDatasetTitle('Table: bronze');
      await fetchDataset('bronze');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="app-shell">
      <div className="max-w-7xl mx-auto px-4 py-6 md:px-6 lg:px-8 space-y-6">
        <header className="section-card p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Database className="text-red-600 w-8 h-8" />
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Telemetry Cleanup Challenge</p>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900">Data Grand Prix</h1>
                </div>
              </div>
              <p className="max-w-3xl section-subtitle">
                Clean the race telemetry data, check the quality impact, and run the simulation once the gold table is ready.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={handleReset}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw size={18} />
                <span>Reset sandbox</span>
              </button>
              <button
                onClick={handleRunRace}
                disabled={!scorecard}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-2 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                <Zap size={18} />
                <span>Run race simulation</span>
              </button>
            </div>
          </div>
        </header>

        {errorMsg && (
          <div className="section-card border-red-200 bg-red-50 p-4 text-red-800">
            <p className="font-medium">Action needed</p>
            <p className="mt-1 text-sm">{errorMsg}</p>
          </div>
        )}

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="xl:col-span-7 space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="section-heading">Data workspace</h2>
                <p className="section-subtitle">Review the bronze, silver, and gold tables or inspect query results.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {['bronze', 'silver', 'gold'].map((t) => (
                  <button
                    key={t}
                    onClick={() => fetchDataset(t)}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize transition ${activeTable === t
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <DatasetViewer data={dataset} title={datasetTitle} />
          </div>

          <div className="xl:col-span-5 space-y-6">
            <section>
              <div className="mb-4">
                <h2 className="section-heading">SQL editor</h2>
                <p className="section-subtitle">Write cleanup SQL here, then run it against the backend sandbox.</p>
              </div>
              <SQLEditor onRunQuery={handleRunQuery} isLoading={isLoading} />
            </section>

            <section>
              <div className="mb-4">
                <h2 className="section-heading">Quality results</h2>
                <p className="section-subtitle">Check whether your cleaned dataset improves readiness without removing too much data.</p>
              </div>
              <QualityScorePanel scorecard={scorecard} />
            </section>

            <section>
              <div className="mb-4">
                <h2 className="section-heading">Simulation</h2>
                <p className="section-subtitle">Replay the race and compare the final lap time against the benchmark drivers.</p>
              </div>
              <RaceReplay raceResults={raceResults} />
            </section>

            <section>
              <div className="mb-4">
                <h2 className="section-heading">Leaderboard</h2>
                <p className="section-subtitle">Your position updates after each completed race simulation.</p>
              </div>
              <Leaderboard raceTime={raceResults?.final_time} scorecard={scorecard} />
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
