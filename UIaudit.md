UI audit — 8 issues found
UI-1 · Layout · Right column too narrow for its content
xl:col-span-5 stacks SQL editor + score panel + race replay + leaderboard vertically
Each panel is cramped; the race canvas is only 200px tall in a 400px-wide box
Fix: move leaderboard below both columns at full width, give replay its own row
UI-2 · DatasetViewer · min-h-[720px] is too tall on most screens
720px locks the left column height regardless of content — causes excessive scroll
Fix: use flex-1 with overflow-auto and a max height, or h-[calc(100vh-200px)]
UI-3 · "Run race simulation" button always visible, often disabled
Button sits in the header, greyed out until gold table exists — confusing before first run
Fix: show it only after scorecard exists, or add a tooltip explaining what's needed
UI-4 · SQLEditor · Stage 2 gold SQL is commented out by default
New players see only silver SQL; the gold step is hidden in comments below the fold
Fix: show two tabs (Stage 1 / Stage 2) or a step indicator to guide the pipeline
UI-5 · QualityScorePanel · score appears before gold table exists
evaluateScore() fires after every query, even silver-only — shows partial score with no gold
Fix: only show score panel when gold table is confirmed to exist
UI-6 · RaceReplay · canvas renders at wrong DPI on retina displays
width=400 height=200 fixed — no devicePixelRatio scaling, looks blurry on HiDPI screens
Fix: scale canvas by window.devicePixelRatio and set CSS size separately
UI-7 · Table buttons (bronze/silver/gold) show no disabled state for missing tables
Clicking silver or gold before they exist silently fails — no feedback to the player
Fix: grey out + tooltip "Run SQL to create this table first"
UI-8 · Error banner never auto-dismisses
setErrorMsg is cleared on next query but not on successful actions or after a timeout
Fix: auto-clear after 5s, or add an ✕ dismiss button to the error banner
BACKEND · track_temp not cleaned by default SQL → schema score 4/20
Silver SQL passes track_temp through unchanged — '28C' strings fail validation
Fix hint SQL: TRY_CAST(REPLACE(CAST(track_temp AS VARCHAR),'C','') AS INTEGER) AS track_temp
