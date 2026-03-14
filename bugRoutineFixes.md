ISSUE 1 — Security (most important) — game_session.py, _validate_query:
python# Add these blocked functions after the blocked_tokens check:
blocked_functions = [
    "READ_CSV", "READ_CSV_AUTO", "READ_PARQUET",
    "READ_JSON", "READ_TEXT", "READ_NDJSON",
    "GLOB(", "HTTPFS", "PARQUET_SCAN",
]
for fn in blocked_functions:
    if fn in upper_query:
        raise ValueError(f"Disallowed function: {fn.lower()}. Only the bronze table is available.")
ISSUE 2 — Hint SQL — SQLEditor.jsx, change the COALESCE default:
sql-- Before:
COALESCE(LOWER(TRIM(tire_type)), 'unknown') AS tire_type

-- After (impute with a valid value):
COALESCE(LOWER(TRIM(tire_type)), 'soft') AS tire_type
ISSUE 3 — Duplicate table error — Change the hint to use CREATE OR REPLACE TABLE throughout, so re-running queries doesn't crash.
ISSUE 4 — rn column leak — Wrap the outer SELECT:
sqlCREATE TABLE gold AS
SELECT * EXCLUDE (rn) FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY driver_id, lap ORDER BY lap_time) AS rn
  FROM silver
) WHERE rn = 1 AND fuel_level >= 0;
ISSUE 5 — Leaderboard margin — In Leaderboard.jsx, lower benchmark1 from 410.45 to something like 407.0 so VER is genuinely hard to beat rather than barely beatable with perfect SQL. Right now there's only a 0.24s gap.
ISSUE 6 — Default editor text — Make the starter SQL show something meaningful rather than SELECT * FROM bronze with no cleaning. Even a partial silver pipeline as the default teaches the game loop on first load.
