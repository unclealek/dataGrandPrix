Critical bugs (block the first run)
BUG 1+2 — scoring_engine.py: Normalization check is wrong
The scorer checks for {"Soft", "Medium", "Hard"} (title-case), but LOWER() in SQL produces "soft", "medium", "hard". This means normalization always scores 0/20 even when the player cleans perfectly. Also, LOWER(NULL) stays NULL, so tire_type nulls are never resolved by SQL and null_handling can never reach 30/30.
Fix in scoring_engine.py, analyze_issues():
python# Before:
valid_tires = {"Soft", "Medium", "Hard"}

# After — accept both casing conventions:
valid_tires = {"soft", "medium", "hard", "Soft", "Medium", "Hard"}
BUG 3 — scoring_engine.py: Dedup score miscounts
DISTINCT * only removes exact duplicate rows. But the dataset's injected duplicates vary on some columns (e.g. sector times have micro-variation), so duplicate_driver_lap stays high after DISTINCT. The scorer should document this expectation, or the hint SQL in the editor should use ROW_NUMBER() dedup instead. The simplest fix is to align the example SQL in SQLEditor.jsx:
sqlCREATE TABLE gold AS
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY driver_id, lap ORDER BY lap_time) AS rn
  FROM silver
) WHERE rn = 1 AND fuel_level >= 0;
BUG 6 — vite.config.js: No dev proxy → CORS errors in dev
App.jsx hardcodes http://localhost:8000. In development this causes CORS preflight failures unless you set up Vite's proxy. Fix vite.config.js:
jsimport { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
Then change App.jsx's const API_URL = '' (empty string, so all calls go to /api/...), or use const API_URL = '/api'.
BUG 7 — index.html: Wrong title + missing favicon
html<!-- Before -->
<title>frontend</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />

<!-- After -->
<title>Data Grand Prix</title>
<!-- either create a favicon.svg in /public, or remove the link tag -->

Moderate bugs (degrade experience)
BUG 8 — SQLEditor.jsx: Monaco auto-falls back after 1.5s even when it loads fine
The current logic starts a 1.5s timer on mount and switches to textarea if Monaco hasn't called onMount yet. But Monaco sometimes loads in 1.5–2s on slow connections, causing a jarring switch mid-type. Fix by only switching if Monaco definitively fails, not on a timeout:
jsx// Remove the useEffect with the timer entirely.
// The fallback button already lets users switch manually.
// Monaco's `loading` prop shows a placeholder while it initializes.
```

### BUG 4 — `sql_engine.py` is dead code

`SQLEngine` is never used — `GameSession` is the actual engine. The file can either be deleted or kept as a development artifact, but it has weaker safety validation (e.g. it checks `"DROP "` with a trailing space, missing cases like `DROP\t`). No action needed to get things running, but worth cleaning up.

### BUG 5 — No `requirements.txt`

Add `backend/requirements.txt`:
```
fastapi>=0.110.0
uvicorn[standard]>=0.29.0
duckdb>=0.10.0
pandas>=2.0.0
numpy>=1.26.0
