# How to Wire the Race Replay into dataGrandPrix

## What you've been given

```
src/
  utils/
    racePositionEngine.ts   ← converts your score events → car movement
    fetchRaceField.ts       ← fetches 20 real F1 drivers from OpenF1
  hooks/
    useLiveRace.ts          ← animation loop: real drivers + user car
  components/
    RaceOverlay.tsx         ← DROP-IN component (session picker → live race)
    LiveTrackCanvas.tsx     ← Canvas renderer (track + cars + visual cues)
    LiveLeaderboard.tsx     ← Leaderboard (YOU + 20 real drivers)
    UserHUD.tsx             ← Speed, position, score, fuel, hud message
    *.module.css            ← styles
```

---

## Step 1 — Install no new dependencies

Everything uses React, Canvas API, and the OpenF1 REST API (no auth needed).
Your existing scoring system (`scoring.ts`) is untouched.

---

## Step 2 — Add RaceOverlay to your game layout

Find wherever you render the main game (likely `src/App.tsx` or a game page component).

```tsx
// BEFORE (your existing layout):
import { SqlEditor } from "./components/SqlEditor";
import { DataTable } from "./components/DataTable";

export function GamePage() {
  const [scoringState, setScoringState] = useState(() =>
    createInitialScoringState(rows, columns)
  );
  const [lastScoreEvent, setLastScoreEvent] = useState<ScoreEvent | null>(null);

  // your existing confirm handler:
  const handleConfirm = (sql, prevRows, prevCols, nextRows, nextCols) => {
    const event = scorePreview({ sql, previousRows: prevRows, ... });
    const newState = applyConfirmedScore(scoringState, event, sql, nextRows, nextCols);
    setScoringState(newState);
    setLastScoreEvent(event);           // ← this is the only new line needed
  };

  return (
    <div className="layout">
      <SqlEditor onConfirm={handleConfirm} />
      <DataTable />
    </div>
  );
}

// AFTER — add RaceOverlay as a panel alongside your SQL editor:
import { RaceOverlay } from "./components/RaceOverlay";

export function GamePage() {
  // ... same as above ...

  return (
    <div className="layout">
      <div className="leftPanel">
        <SqlEditor onConfirm={handleConfirm} />
        <DataTable />
      </div>

      {/* Right panel — always visible, updates as player cleans */}
      <div className="rightPanel">
        <RaceOverlay
          scoringState={scoringState}
          lastScoreEvent={lastScoreEvent}
          width={700}
          height={600}
        />
      </div>
    </div>
  );
}
```

That's it. The race auto-plays, auto-updates on every SQL confirm.

---

## Step 3 — Understand the data flow

```
Player writes SQL
      ↓
scorePreview()           [your existing code, unchanged]
      ↓
ScoreEvent emitted
  { race_event: "STRAIGHT_BOOST", speed_delta: +15, quality_score: 72.3 }
      ↓
applyScoreEventToCarState()  [racePositionEngine.ts]
  Translates to:
  • userCar.speed     = scoringState.currentSpeed  (e.g. 255)
  • userCar.visualCue = "STRAIGHT_BOOST"           (green glow for 2s)
  • userCar.position  = scoreToPosition(72.3)      = P6
  • userCar.hudMessage = "Cleaning move landed…"
      ↓
Animation loop (requestAnimationFrame)
  Every frame:
  • User car advances along track at speed-proportional rate
  • Real drivers advance through their pre-recorded OpenF1 frames
  • Position recalculated by comparing track progress
  • Canvas redraws
```

---

## Step 4 — Visual cue mapping

Every `race_event` from your scoring system maps to a visual on the track:

| Your race_event     | What the user sees                          |
|---------------------|---------------------------------------------|
| STRAIGHT_BOOST      | Green glow trail for 2s                     |
| CORNER_TAKEN        | Blue arc flash                              |
| SPIN_OUT            | Red spiral + expanding ring                 |
| TYRE_PUNCTURE       | Orange wobble + "! FLAT" label              |
| COLLISION           | Red flash + pulsing ring + "💥 COLLISION"   |
| FUEL_WASTE          | Grey fade                                   |
| PIT_STOP_WASTED     | Yellow flash                                |
| OVER_ENGINEERED     | Purple overload glow                        |
| CLEAN_LAP           | Gold trail (perfect 100 score)              |

---

## Step 5 — Speed → position mechanics

Your scoring system produces `currentSpeed` (starts at 240, range ~160–320+).

The position engine maps this linearly:
- Speed 160 → 0.6× track speed → user stays at back
- Speed 240 → 1.0× track speed → user keeps pace with midfield
- Speed 320 → 1.4× track speed → user overtakes to podium

Quality score also gives instant position feedback:
- Score 0   → P20 (starting position)
- Score 50  → P10
- Score 85  → P3 (Silver threshold)
- Score 100 → P1 (Gold threshold)

---

## Step 6 — OpenF1 API notes

- Free, no API key needed
- Full race session = ~200MB of data, takes 20–40s to load
- Once loaded it's in memory for the session
- Recommended: pre-select a 2024 race and hardcode the session_key
  to skip the picker and auto-load on game start

**Fastest sessions to load** (fewer laps / shorter races):
- Monaco 2024: session_key = 9552 (~78 laps but tight circuit)
- Bahrain 2024: session_key = 9472 (good reference circuit)

To hardcode a session and skip the picker:
```tsx
<RaceOverlay
  scoringState={scoringState}
  lastScoreEvent={lastScoreEvent}
  defaultSessionKey={9472}   // add this prop, handle in RaceOverlay
/>
```

---

## Step 7 — Recommended layout

The replay works best as a **right panel** that's always visible:

```
┌─────────────────────────────────────────────────────┐
│  [Bronze] [Silver] [Gold]  tabs                     │
├──────────────────────┬──────────────────────────────┤
│                      │                              │
│   Monaco SQL Editor  │     🏎 Live Race             │
│   ─────────────────  │     Track + 21 cars          │
│   > SELECT * FROM…   │     Leaderboard              │
│                      │     Speed / Score HUD        │
├──────────────────────┤                              │
│   Data Table Preview │                              │
│                      │                              │
└──────────────────────┴──────────────────────────────┘
```

The race is always updating in the right panel. Every SQL confirm
immediately changes the user's car speed and triggers a visual cue.
