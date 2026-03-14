UI-1 — Layout restructure (App.jsx). The right column is doing too much. Suggested grid:
jsx// Two equal columns for workspace + editor/score
<section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
  <DatasetViewer ... />         // left col
  <div>                         // right col: editor + score only
    <SQLEditor ... />
    <QualityScorePanel ... />
  </div>
</section>
// Full-width row below for race + leaderboard side by side
<section className="grid grid-cols-1 gap-6 md:grid-cols-2">
  <RaceReplay ... />
  <Leaderboard ... />
</section>
UI-2 — DatasetViewer height (DatasetViewer.jsx): replace min-h-[720px] with h-[60vh] max-h-[700px] so it fills the viewport proportionally rather than forcing a fixed 720px block.
UI-3 — Race button (App.jsx): change disabled={!scorecard} to conditionally render — or at minimum add a title tooltip: title={!scorecard ? "Create a gold table first" : ""}.
UI-4 — Stage 2 SQL visibility (SQLEditor.jsx): the gold query is commented out below the fold. Either split into two named tabs, or uncomment it and let the player run both stages as a single script. Running them in sequence works fine with CREATE OR REPLACE TABLE.
UI-5 — Score fires too early (App.jsx): evaluateScore() is called after every query. Wrap it with a check:
jsconst evaluateScore = async () => {
  const goldExists = await fetch(`${API_URL}/dataset?table=gold`);
  if (!goldExists.ok) { setScorecard(null); return null; }
  // ... rest of scoring
};
UI-6 — Retina canvas (RaceReplay.jsx): add at the start of the animation setup:
jsconst dpr = window.devicePixelRatio || 1;
canvas.width = 400 * dpr;
canvas.height = 200 * dpr;
canvas.style.width = '400px';
canvas.style.height = '200px';
ctx.scale(dpr, dpr);
UI-7 — Table buttons (App.jsx): track which tables exist in state and disable buttons for missing ones, with a title hint.
UI-8 — Error banner (App.jsx): add setTimeout(() => setErrorMsg(''), 5000) whenever setErrorMsg is called with a non-empty string.
Backend (track_temp): update the silver stage hint in SQLEditor.jsx to include:
sqlTRY_CAST(REPLACE(CAST(track_temp AS VARCHAR), 'C', '') AS INTEGER) AS track_temp,
