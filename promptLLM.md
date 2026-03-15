Build a frontend-first MVP for a web app called “Data Grand Prix” based on this exact product concept:

PRODUCT SUMMARY
Data Grand Prix is a racing-inspired SQL cleaning game where users progressively clean a dataset through table layers:
- Bronze
- Silver
- Gold

The player writes SQL in a Monaco editor, runs the query, previews the cleaned result on the right panel, confirms the result if satisfied, and then promotes data through cleaning stages using a “Qualify” flow.

The UI should feel like a motorsport / F1 telemetry dashboard: dark, premium, sharp, structured, and interactive.

==================================================
CORE UX MODEL
==================================================

There are two main table panels:

LEFT PANEL
- This is the current working table
- It represents the current confirmed state of the dataset for the active layer
- This is the table the next SQL query should run against

RIGHT PANEL
- This is the preview / result panel
- After the user executes SQL, the transformed result appears here
- The user can inspect it before accepting it

FLOW
1. User starts with a current table on the left
2. User writes SQL in Monaco editor
3. User clicks Run
4. SQL executes against the current left-side table
5. Result appears in the right-side “Applied Clean” panel
6. User explores and reviews the result
7. User can:
   - Confirm it
   - Reverse / discard it
   - Use history navigation within the current layer

CONFIRM LOGIC
- When the user clicks Confirm:
  - The result currently shown in the right panel becomes the new confirmed current table
  - That confirmed table moves into the left panel
  - The right panel is cleared or reset to preview state
  - The newly confirmed left table is now the table used for the next SQL execution
- This creates an iterative cleaning workflow

REVERSE / HISTORY LOGIC
- There should be a Reverse button for undoing the latest confirmed change within the current layer
- There should also be a History control/button/panel so users can navigate previous confirmed states within the current layer
- Users should be able to move backward and inspect or restore earlier confirmed states within the same layer
- Think of this as version history for the current table layer

IMPORTANT LAYER RULE
History is isolated by layer:
- Bronze history is only navigable while in Bronze
- Silver history is only navigable while in Silver
- Gold history is only navigable while in Gold
- Users cannot move backward across layers once they qualify upward

==================================================
LAYER / QUALIFY SYSTEM
==================================================

The app has three table layers:
- Bronze Table
- Silver Table
- Gold Table

Users begin in Bronze.

QUALIFY BUTTON BEHAVIOR
When the user clicks the large “QUALIFY” button:
- Open a modal or overlay
- Show radio button options:
  - Bronze Table
  - Silver Table
  - Gold Table

RULES FOR RADIO OPTIONS
1. The current layer should be visible but disabled/greyed out
   Example:
   - If user is in Bronze, “Bronze Table” is disabled and cannot be selected
   - If user is in Silver, “Silver Table” is disabled
   - If user is in Gold, “Gold Table” is disabled

2. Users can qualify the current table upward only
   - From Bronze → Silver or Gold
   - From Silver → Gold
   - From Gold → nowhere further

3. Once a user qualifies into a higher layer:
   - The current confirmed table becomes the starting table of that new layer
   - They can no longer reverse into the previous layer
   - They can no longer access the previous layer’s history
   - They can only work with history created inside the newly qualified layer

4. History remains separate per layer
   - Bronze has its own state history
   - Silver has its own state history
   - Gold has its own state history

EXAMPLE
- User cleans Bronze several times and confirms multiple states
- Bronze history contains those confirmed versions
- User clicks Qualify and promotes current Bronze table to Silver
- Silver starts with that promoted version as its base state
- Bronze history is now locked and inaccessible
- User can continue cleaning in Silver and create Silver-only history
- Later user may qualify Silver to Gold
- Silver history then becomes locked and inaccessible
- Gold begins with the promoted Silver state

==================================================
PAGE LAYOUT
==================================================

Recreate this structure faithfully:

1. TOP HEADER
- Title: DATA GRAND PRIX
- Reset button on top right
- Optional current layer badge:
  - Bronze
  - Silver
  - Gold
- Racing / telemetry styling
- Dark premium dashboard aesthetic

2. TELEMETRY SECTION
- Label: TELEMETRY
- Two side-by-side panels

LEFT PANEL
- Title should reflect current context, for example:
  - CURRENT TABLE
  - or BRONZE CURRENT / SILVER CURRENT / GOLD CURRENT
- Displays the latest confirmed table for the active layer

RIGHT PANEL
- Title: APPLIED CLEAN
- Displays the preview result of the latest SQL execution
- Includes status feedback after run:
  - success
  - rows returned
  - validation warnings if needed

RIGHT PANEL ACTIONS
After successful query execution, show:
- Confirm button
- Reverse button or discard preview button
- Optional History button/control nearby

3. EDITOR MODE STRIP
- Small strip with two tabs:
  - MONACO RUN
  - PLAIN EDITOR
- Monaco Run active by default
- Plain Editor can be present visually even if basic in MVP

4. SQL EDITOR SECTION
- Real Monaco Editor, not a fake textarea
- Dark SQL syntax highlighting
- Starter SQL
- Run button aligned bottom-right of editor section

5. BOTTOM PRIMARY CTA
- Large “QUALIFY” button
- Styled like a race advancement / progression control

==================================================
EDITOR / EXECUTION ARCHITECTURE
==================================================

Use this exact architecture:

Frontend (Monaco SQL editor):
- User types SQL into Monaco Editor
- On clicking Run, read SQL using editor.getValue() or component state/value
- Send SQL to backend using HTTP POST /api/query

Backend API:
- Receives SQL string
- Validates and authorizes it
- Executes it against the current active confirmed table state for the current layer
- Returns rows or an error as JSON

IMPORTANT
- Never execute SQL directly in the browser
- All execution happens server-side
- The backend should understand the currently active layer and current confirmed state

==================================================
STATE MODEL
==================================================

Implement an explicit state model for the MVP.

Suggested concept:

activeLayer:
- bronze
- silver
- gold

layerState:
{
  bronze: {
    history: [tableVersion1, tableVersion2, ...],
    currentIndex: number
  },
  silver: {
    history: [tableVersion1, tableVersion2, ...],
    currentIndex: number
  },
  gold: {
    history: [tableVersion1, tableVersion2, ...],
    currentIndex: number
  }
}

previewState:
- Holds result of latest SQL execution before confirmation
- Shown on the right panel only
- Does not affect left panel until Confirm is pressed

CONFIRM ACTION
- Push preview result into active layer history
- Advance currentIndex
- Update left panel
- Clear preview

REVERSE ACTION
- Move backward within current layer history only
- Never across layers

HISTORY NAVIGATION
- Allow user to inspect and restore prior confirmed versions within active layer
- Could be a dropdown, drawer, version list, or step navigation UI
- Should show version labels such as:
  - Bronze v1
  - Bronze v2
  - Bronze v3
  - Silver v1
  - etc.

QUALIFY ACTION
- Promote current confirmed state from active layer into selected higher layer
- Initialize target layer history with that promoted dataset as its first version if not already created
- Switch activeLayer to the selected target layer
- Lock access to previous layer history

==================================================
RESET LOGIC
==================================================

Reset should restore the entire experience to initial MVP state:
- Active layer back to Bronze
- Bronze history reset to initial raw dataset
- Silver history cleared
- Gold history cleared
- Preview cleared
- Editor reset to starter SQL

==================================================
MVP DATASET
==================================================

Use a sample messy dataset with realistic columns, for example:
- id
- first_name
- last_name
- email
- country
- signup_date
- amount
- status

Include messy characteristics:
- duplicates
- nulls
- inconsistent casing
- malformed email formatting
- extra spaces
- country name inconsistency

The game should feel like users are progressively transforming dirty data into higher quality layers.

==================================================
BACKEND QUERY SAFETY
==================================================

For MVP safety:
- Prefer allowing SELECT-only queries at first
- Or support a tightly sandboxed transformation model
- Prevent destructive operations such as:
  - DROP
  - DELETE
  - TRUNCATE
  - ALTER
  - INSERT
  - UPDATE
unless the sandbox is intentionally designed for them

If needed, allow users to query from a known current working table alias such as:
- current_table

Example user query:
SELECT
  TRIM(LOWER(first_name)) AS first_name,
  TRIM(LOWER(last_name)) AS last_name,
  email,
  country,
  amount
FROM current_table

==================================================
API CONTRACT
==================================================

POST /api/query
Request:
{
  "sql": "SELECT ...",
  "activeLayer": "bronze",
  "currentVersionId": "bronze_v3"
}

Response success:
{
  "success": true,
  "columns": [...],
  "rows": [...],
  "rowCount": 100
}

Response error:
{
  "success": false,
  "error": "Human-readable error message"
}

Optional qualify endpoint:
POST /api/qualify
Request:
{
  "fromLayer": "bronze",
  "toLayer": "silver",
  "currentVersionId": "bronze_v4"
}

Response:
{
  "success": true,
  "activeLayer": "silver"
}

==================================================
DESIGN SYSTEM
==================================================

Visual direction:
- Dark racing dashboard
- F1 / telemetry inspiration
- Steel, graphite, dark navy surfaces
- Gold/yellow accent for QUALIFY and CONFIRM
- Blue/steel accent for editor and system controls
- Panel depth, subtle texture, premium contrast
- Clean typography
- Strong hierarchy
- Desktop-first
- Modern and believable, not cartoonish

Important UI cues:
- Current layer badge clearly visible
- Confirm state visually obvious
- History/navigation controls easy to discover
- Disabled radio option for current layer clearly greyed out
- Locked previous-layer history implied once qualified

==================================================
STACK
==================================================

Preferred stack:
- Next.js + React
- Tailwind CSS
- Monaco Editor
- Next.js API routes or Express backend
- SQLite/Postgres or an in-memory mock backend for MVP
- Reusable data grid / table component

==================================================
DELIVERABLES
==================================================

Generate all of the following:

1. Full frontend page implementation
2. Monaco editor integration
3. Left and right telemetry table panels
4. Confirm / Reverse / History interaction logic
5. Qualify modal with radio buttons
6. Layered state management for Bronze / Silver / Gold
7. API route for SQL execution
8. Mock dataset
9. Safe query execution logic
10. Clean file structure
11. Local setup instructions

==================================================
IMPORTANT IMPLEMENTATION NOTES
==================================================

- The Monaco editor must be real and functional
- The left panel must always represent the latest confirmed current table for the active layer
- The right panel must always represent the latest unconfirmed preview result
- Confirm must move preview result into the left panel as the new working state
- Reverse/history must work only within the active layer
- Qualifying must permanently lock backward navigation into previous layers
- The UI should closely match this structure:
  header → telemetry panels → mode strip → SQL editor → qualify flow
- Build for extensibility so game scoring and racing mechanics can be added later

==================================================
OPTIONAL FUTURE HOOKS
==================================================

Leave clean extension points for:
- lap timing
- quality score
- penalties for over-cleaning
- telemetry stats
- replay animation
- scenario-based races
- multiplayer later

Now generate the full implementation with clean, modular, extensible code.
