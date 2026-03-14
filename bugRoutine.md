ISSUE 1 · Security · game_session.py
read_csv_auto('/etc/passwd') executes successfully — filesystem not sandboxed
Players can read arbitrary server files via SELECT * FROM read_csv_auto('/any/path')
Fix: block read_csv, read_parquet, read_json, read_text, glob in _validate_query
ISSUE 2 · Scoring · SQLEditor.jsx hint produces 88 not 100
COALESCE(tire_type, 'unknown') leaves 5 rows with invalid tire values → normalization 8/20
Player following the hint SQL gets penalised without knowing why
Fix: change hint to COALESCE(LOWER(TRIM(tire_type)), 'soft') or filter NULLs out
ISSUE 3 · UX · Duplicate table error has no recovery path
Running the same CREATE TABLE twice throws a DuckDB error the player sees raw
"Catalog Error: Table with name silver already exists!" with no guidance
Fix: change hint SQL to CREATE OR REPLACE TABLE, or show a friendly message
ISSUE 4 · Scoring · rn column leaks into gold
ROW_NUMBER() hint leaves an extra rn column in gold — visible in the table viewer
Fix: wrap with SELECT * EXCLUDE (rn) or list columns explicitly in the outer SELECT
ISSUE 5 · Leaderboard · benchmark times barely beatable
VER benchmark = 410.45s. Best achievable player time = 410.21s — only a 0.24s margin
Near-perfect SQL needed to reach P1; most good attempts will land P2 or P3
ISSUE 6 · UX · Gold table hint SQL not in the default editor text
The gold ROW_NUMBER() hint is commented out — players may not see it
The default starter query only creates silver = bronze (no cleaning at all)
