/**
 * RaceOverlay.tsx
 * ───────────────
 * DROP-IN component for your existing dataGrandPrix SQL game.
 *
 * Usage in your existing game layout:
 *
 *   import { RaceOverlay } from "./components/RaceOverlay";
 *
 *   // In your game component, pass the scoring state and latest score event:
 *   <RaceOverlay
 *     scoringState={scoringState}
 *     lastScoreEvent={lastConfirmedScoreEvent}
 *   />
 *
 * The component:
 *   1. Shows a session picker on first load
 *   2. Fetches the race field from OpenF1
 *   3. Starts the live replay immediately
 *   4. Updates the user's car in real time as SQL events arrive
 */

import { useState, useCallback } from "react";
import { fetchRaceField, listRaceSessions } from "../utils/fetchRaceField";
import { useLiveRace } from "../hooks/useLiveRace";
import { LiveTrackCanvas } from "./LiveTrackCanvas";
import { LiveLeaderboard } from "./LiveLeaderboard";
import { UserHUD } from "./UserHUD";
import type { SessionScoringState, ScoreEvent } from "../types";
import type { RaceField, SessionSummary } from "../utils/fetchRaceField";
import styles from "./RaceOverlay.module.css";

interface Props {
  scoringState: SessionScoringState | null;
  lastScoreEvent: ScoreEvent | null;
  /** Optional: constrain the panel width */
  width?: number;
  height?: number;
}

type LoadState = "pick" | "loading" | "ready" | "error";

export function RaceOverlay({
  scoringState,
  lastScoreEvent,
  width = 900,
  height = 720,
}: Props) {
  const [loadState, setLoadState] = useState<LoadState>("pick");
  const [field, setField] = useState<RaceField | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [loadMsg, setLoadMsg] = useState("Loading…");
  const [loadError, setLoadError] = useState<string | null>(null);

  const race = useLiveRace(field, scoringState, lastScoreEvent);

  // Load session list on first render of the picker
  const loadSessions = useCallback(async () => {
    if (sessionsLoaded) return;
    try {
      const s = await listRaceSessions(2024);
      setSessions(s);
      setSessionsLoaded(true);
    } catch (e) {
      setSessions([]);
    }
  }, [sessionsLoaded]);

  // Called when user picks a session
  const handlePick = useCallback(async (sessionKey: number) => {
    setLoadState("loading");
    setLoadMsg("Connecting to OpenF1…");
    try {
      const raceField = await fetchRaceField(sessionKey, setLoadMsg);
      setField(raceField);
      setLoadState("ready");
    } catch (e) {
      setLoadError(String(e));
      setLoadState("error");
    }
  }, []);

  // ── Session picker ─────────────────────────────────────────────────────────
  if (loadState === "pick") {
    if (!sessionsLoaded) loadSessions();
    return (
      <div className={styles.picker} style={{ width, height }}>
        <div className={styles.pickerInner}>
          <div className={styles.pickerTitle}>🏎 Choose Your Race</div>
          <p className={styles.pickerSub}>
            Your car starts P20. Clean your data to move up the grid.
          </p>
          {!sessionsLoaded && <p className={styles.loading}>Loading sessions…</p>}
          <div className={styles.sessionGrid}>
            {sessions.map((s) => (
              <button
                key={s.sessionKey}
                className={styles.sessionCard}
                onClick={() => handlePick(s.sessionKey)}
              >
                <span className={styles.sessionDate}>
                  {new Date(s.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
                <span className={styles.sessionName}>{s.label}</span>
                <span className={styles.sessionCircuit}>{s.circuit}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loadState === "loading") {
    return (
      <div className={styles.loading} style={{ width, height }}>
        <div className={styles.spinner} />
        <p>{loadMsg}</p>
        <p className={styles.loadHint}>Full race sessions take ~20–40s to load</p>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (loadState === "error" || !field) {
    return (
      <div className={styles.error} style={{ width, height }}>
        <p>Failed to load race: {loadError}</p>
        <button onClick={() => setLoadState("pick")}>← Try Again</button>
      </div>
    );
  }

  // ── Race live ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.race} style={{ width, height }}>
      {/* Track */}
      <LiveTrackCanvas
        field={field}
        realFrames={race.realDriverFrames}
        userCar={race.userCar}
        watchedDriver={0}
        width={width}
        height={height}
      />

      {/* User HUD top-left */}
      <div className={styles.hudSlot}>
        <UserHUD
          userCar={race.userCar}
          totalLaps={field.totalLaps}
          leadLap={race.leadLap}
        />
      </div>

      {/* Leaderboard top-right */}
      <div className={styles.lbSlot}>
        <LiveLeaderboard
          leaderboard={race.leaderboard}
          totalLaps={field.totalLaps}
        />
      </div>

      {/* Speed indicator bottom-left */}
      <div className={styles.speedSlot}>
        <span className={styles.speedLabel}>Speed</span>
        <span className={styles.speedValue}>
          {Math.round(race.userCar.speed)} km/h
        </span>
      </div>

      {/* Replay controls bottom */}
      <div className={styles.controlsSlot}>
        <button className={styles.playBtn} onClick={race.togglePlay}>
          {race.isPlaying ? "⏸" : "▶"}
        </button>
        <div className={styles.scrubWrap}>
          <input
            type="range"
            className={styles.scrubber}
            min={0}
            max={field.timestamps[field.timestamps.length - 1] ?? 0}
            step={1000}
            value={race.replayTime}
            onChange={(e) => race.seek(Number(e.target.value))}
          />
        </div>
        <div className={styles.speedBtns}>
          {([1, 2, 4, 8, 16] as const).map((s) => (
            <button
              key={s}
              className={`${styles.speedBtn} ${race.speed === s ? styles.activeSpeed : ""}`}
              onClick={() => race.setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* Change race */}
      <button
        className={styles.changeBtn}
        onClick={() => { setLoadState("pick"); setField(null); }}
      >
        Change Race
      </button>
    </div>
  );
}
