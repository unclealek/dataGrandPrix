import { useCallback, useEffect, useState } from "react";
import type { ScoreEvent, SessionScoringState } from "../types";
import { fetchRaceField, listRaceSessions, type RaceField, type SessionSummary } from "./fetchRaceField";
import { LiveLeaderboard } from "./LiveLeaderboard";
import { LiveTrackCanvas } from "./LiveTrackCanvas";
import { UserHUD } from "./UserHUD";
import { USER_DRIVER_NUMBER, useLiveRace } from "./useLiveRace";

interface Props {
  scoringState: SessionScoringState | null;
  lastScoreEvent: ScoreEvent | null;
  defaultSessionKey?: number;
  width?: number;
  height?: number;
}

type LoadState = "pick" | "loading" | "ready" | "error";

export function RaceOverlay({
  scoringState,
  lastScoreEvent,
  defaultSessionKey = 9472,
  width = 860,
  height = 620,
}: Props) {
  const [loadState, setLoadState] = useState<LoadState>(defaultSessionKey ? "loading" : "pick");
  const [field, setField] = useState<RaceField | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadMessage, setLoadMessage] = useState("Loading...");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hoveredDriverNumber, setHoveredDriverNumber] = useState<number | null>(null);
  const [selectedDriverNumber, setSelectedDriverNumber] = useState<number | null>(null);

  const race = useLiveRace(field, scoringState, lastScoreEvent);

  const loadField = useCallback(async (sessionKey: number) => {
    setLoadState("loading");
    setLoadError(null);
    setLoadMessage("Connecting to OpenF1...");
    try {
      const nextField = await fetchRaceField(sessionKey, setLoadMessage);
      setField(nextField);
      setLoadState("ready");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unknown OpenF1 error");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    if (!defaultSessionKey) {
      return;
    }
    void loadField(defaultSessionKey);
  }, [defaultSessionKey, loadField]);

  useEffect(() => {
    if (defaultSessionKey || sessions.length > 0 || loadState !== "pick") {
      return;
    }

    let cancelled = false;
    void listRaceSessions(2024)
      .then((items) => {
        if (!cancelled) {
          setSessions(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSessions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [defaultSessionKey, loadState, sessions.length]);

  if (loadState === "pick") {
    return (
      <div className="live-race-picker" style={{ minHeight: height }}>
        <div className="live-race-picker-title">Choose Your Race</div>
        <p className="live-race-picker-copy">Your confirmed SQL transforms affect the YOU car. Pick a 2024 race to start the live overlay.</p>
        <div className="live-race-session-grid">
          {sessions.map((session) => (
            <button key={session.sessionKey} className="live-race-session-card" onClick={() => void loadField(session.sessionKey)}>
              <span>{new Date(session.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
              <strong>{session.label}</strong>
              <small>{session.circuit}</small>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div className="live-race-loading" style={{ minHeight: height }}>
        <div className="live-race-spinner" />
        <p>{loadMessage}</p>
        <small>Full race sessions can take 20-40 seconds to load.</small>
      </div>
    );
  }

  if (!field || loadState === "error") {
    return (
      <div className="live-race-error" style={{ minHeight: height }}>
        <p>Failed to load race data.</p>
        <small>{loadError}</small>
        <button
          className="ghost-button"
          onClick={() => (defaultSessionKey ? void loadField(defaultSessionKey) : setLoadState("pick"))}
        >
          Retry
        </button>
      </div>
    );
  }

  const activeDriverNumber = hoveredDriverNumber ?? selectedDriverNumber;
  const activeDriverInfo =
    activeDriverNumber === USER_DRIVER_NUMBER
      ? {
          acronym: "YOU",
          teamColor: "#00e5ff",
          fullName: "Your Cleaning Run",
          position: race.userCar.position,
          lap: race.userCar.lap,
          speed: race.userCar.speed,
          gear: null,
          drs: null,
        }
      : activeDriverNumber && field.drivers[activeDriverNumber] && race.realDriverFrames[activeDriverNumber]
        ? {
            acronym: field.drivers[activeDriverNumber].acronym,
            teamColor: field.drivers[activeDriverNumber].teamColor,
            fullName: field.drivers[activeDriverNumber].fullName,
            position: race.realDriverFrames[activeDriverNumber].position,
            lap: race.realDriverFrames[activeDriverNumber].lap,
            speed: race.realDriverFrames[activeDriverNumber].speed,
            gear: race.realDriverFrames[activeDriverNumber].gear,
            drs: race.realDriverFrames[activeDriverNumber].drs,
          }
        : null;

  return (
    <div className="live-race-shell">
      <div className="live-race-stage">
        <div className="live-race-header">
          <div>
            <p className="section-kicker">Live Race</p>
            <h3>
              {field.circuit} {field.sessionName}
            </h3>
          </div>
          <div className="live-race-meta-inline">
            <span>{field.totalLaps} laps</span>
            <span>Session {field.sessionKey}</span>
          </div>
        </div>

        <div className="live-race-canvas-wrap">
          <LiveTrackCanvas
            field={field}
            realFrames={race.realDriverFrames}
            userCar={race.userCar}
            selectedDriverNumber={activeDriverNumber}
            onDriverHover={setHoveredDriverNumber}
            onDriverSelect={setSelectedDriverNumber}
            width={width}
            height={height}
          />
          <div className="live-race-hud-slot">
            <UserHUD userCar={race.userCar} totalLaps={field.totalLaps} leadLap={race.leadLap} />
          </div>
          <div className="live-race-board-slot">
            <LiveLeaderboard leaderboard={race.leaderboard} />
          </div>
          {activeDriverInfo ? (
            <div className="live-race-driver-card">
              <div className="live-race-driver-head">
                <strong style={{ color: activeDriverInfo.teamColor }}>{activeDriverInfo.acronym}</strong>
                <span>{activeDriverInfo.fullName}</span>
              </div>
              <div className="live-race-driver-stats">
                <span>P{activeDriverInfo.position}</span>
                <span>L{activeDriverInfo.lap}</span>
                <span>{Math.round(activeDriverInfo.speed)} km/h</span>
                {activeDriverInfo.gear !== null ? <span>G{activeDriverInfo.gear}</span> : null}
                {activeDriverInfo.drs !== null ? <span>{activeDriverInfo.drs ? "DRS ON" : "DRS OFF"}</span> : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="live-race-controls">
          <button className="live-race-play" onClick={race.togglePlay}>
            {race.isPlaying ? "Pause" : "Play"}
          </button>
          <input
            className="live-race-scrubber"
            type="range"
            min={0}
            max={field.timestamps[field.timestamps.length - 1] ?? 0}
            step={1000}
            value={race.replayTime}
            onChange={(event) => race.seek(Number(event.target.value))}
          />
          <div className="live-race-speed-group">
            {([1, 2, 4, 8, 16] as const).map((value) => (
              <button
                key={value}
                className={`live-race-speed${race.speed === value ? " active" : ""}`}
                onClick={() => race.setSpeed(value)}
              >
                {value}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
