/**
 * useLiveRace.ts
 * ──────────────
 * The central hook that wires everything together.
 *
 * Inputs:
 *   - RaceField (20 real drivers from OpenF1)
 *   - SessionScoringState (from your existing scoring system)
 *   - Latest ScoreEvent (emitted when user confirms a SQL transform)
 *
 * Outputs:
 *   - User car state (position, speed, cue, etc.)
 *   - All 20 real driver snapshots at current replay time
 *   - Leaderboard (user + real drivers, sorted by position)
 *   - Replay controls (play/pause/speed)
 *
 * Architecture:
 *   The replay runs on a requestAnimationFrame loop.
 *   Real drivers advance through their pre-recorded OpenF1 frames.
 *   The user's car advances at a speed derived from their scoring state.
 *   Every time a ScoreEvent is confirmed, applyScoreEventToCarState() is called
 *   and the user's car immediately responds.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { SessionScoringState, ScoreEvent } from "../types";
import type { RaceField, DriverSnapshot } from "../utils/fetchRaceField";
import {
  createInitialUserCarState,
  applyScoreEventToCarState,
  tickUserCar,
  type UserCarState,
  type RaceDriverPosition,
} from "../utils/racePositionEngine";

export type ReplaySpeed = 1 | 2 | 4 | 8 | 16;

export interface LeaderboardEntry {
  isUser: boolean;
  driverNumber: number;         // 0 = user
  acronym: string;
  teamColor: string;
  position: number;
  lap: number;
  speed: number;
  isOut: boolean;
}

export interface LiveRaceState {
  /** User's car */
  userCar: UserCarState;
  /** Real driver snapshots at current replay time */
  realDriverFrames: Record<number, DriverSnapshot>;
  /** Combined leaderboard sorted by position */
  leaderboard: LeaderboardEntry[];
  /** Current replay timestamp (ms since session start) */
  replayTime: number;
  /** Current race lap (from lead driver) */
  leadLap: number;
  isPlaying: boolean;
  speed: ReplaySpeed;
  progress: number; // 0–1
  // controls
  togglePlay: () => void;
  setSpeed: (s: ReplaySpeed) => void;
  seek: (ms: number) => void;
}

// ─── User driver constants ────────────────────────────────────────────────────
export const USER_DRIVER_NUMBER = 0;
export const USER_ACRONYM = "YOU";
export const USER_COLOR = "#00e5ff";

export function useLiveRace(
  field: RaceField | null,
  scoringState: SessionScoringState | null,
  /** Pass the latest confirmed ScoreEvent; hook detects changes by reference */
  lastScoreEvent: ScoreEvent | null
): LiveRaceState {
  const [replayTime, setReplayTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const [userCar, setUserCar] = useState<UserCarState>(createInitialUserCarState());

  const rafRef = useRef<number | null>(null);
  const lastRealTimeRef = useRef<number | null>(null);
  const lastScoreEventRef = useRef<ScoreEvent | null>(null);

  const maxTime = field ? field.timestamps[field.timestamps.length - 1] ?? 0 : 0;

  // ── Apply score events when they change ─────────────────────────────────────
  useEffect(() => {
    if (!lastScoreEvent || lastScoreEvent === lastScoreEventRef.current) return;
    if (!scoringState) return;
    lastScoreEventRef.current = lastScoreEvent;
    setUserCar((prev) => applyScoreEventToCarState(prev, lastScoreEvent, scoringState));
  }, [lastScoreEvent, scoringState]);

  // ── Get real driver snapshots at a given timestamp ──────────────────────────
  const getFramesAt = useCallback(
    (ts: number): Record<number, DriverSnapshot> => {
      if (!field) return {};
      const timestamps = field.timestamps;
      let lo = 0, hi = timestamps.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (timestamps[mid] <= ts) lo = mid;
        else hi = mid - 1;
      }
      return field.frames[timestamps[lo]] ?? {};
    },
    [field]
  );

  // ── Animation loop ──────────────────────────────────────────────────────────
  const tick = useCallback(
    (realNow: number) => {
      if (!field) return;

      if (lastRealTimeRef.current !== null) {
        const elapsed = (realNow - lastRealTimeRef.current) * speed;

        // Advance replay time
        setReplayTime((prev) => {
          const next = Math.min(maxTime, prev + elapsed);
          if (next >= maxTime) setIsPlaying(false);
          return next;
        });

        // Advance user car
        setUserCar((prev) => {
          const currentFrames = getFramesAt(replayTime);
          const realDriverPositions: RaceDriverPosition[] = Object.values(currentFrames).map((f) => ({
            driverNumber: f.driverNumber,
            trackProgress: f.trackProgress,
            position: f.position,
            lap: f.lap,
          }));
          return tickUserCar(prev, elapsed, realDriverPositions, field.totalLaps);
        });
      }

      lastRealTimeRef.current = realNow;
      rafRef.current = requestAnimationFrame(tick);
    },
    [field, speed, maxTime, getFramesAt, replayTime]
  );

  useEffect(() => {
    if (isPlaying) {
      lastRealTimeRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastRealTimeRef.current = null;
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, tick]);

  // Auto-play when field loads
  useEffect(() => {
    if (field) setTimeout(() => setIsPlaying(true), 500);
  }, [field]);

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") { e.preventDefault(); setIsPlaying((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Assemble current state ──────────────────────────────────────────────────
  const realDriverFrames = getFramesAt(replayTime);

  const leadLap = Object.values(realDriverFrames).reduce(
    (max, f) => Math.max(max, f.lap), 1
  );

  // Build leaderboard: user + all real drivers
  const leaderboard: LeaderboardEntry[] = [];

  // User entry
  leaderboard.push({
    isUser: true,
    driverNumber: USER_DRIVER_NUMBER,
    acronym: USER_ACRONYM,
    teamColor: USER_COLOR,
    position: userCar.position,
    lap: userCar.lap,
    speed: userCar.speed,
    isOut: false,
  });

  // Real drivers
  for (const [dnStr, frame] of Object.entries(realDriverFrames)) {
    const dn = Number(dnStr);
    const driver = field?.drivers[dn];
    if (!driver) continue;
    leaderboard.push({
      isUser: false,
      driverNumber: dn,
      acronym: driver.acronym,
      teamColor: driver.teamColor,
      position: frame.position,
      lap: frame.lap,
      speed: frame.speed,
      isOut: frame.position > 20,
    });
  }

  leaderboard.sort((a, b) => a.position - b.position);

  return {
    userCar,
    realDriverFrames,
    leaderboard,
    replayTime,
    leadLap,
    isPlaying,
    speed,
    progress: maxTime > 0 ? replayTime / maxTime : 0,
    togglePlay: () => setIsPlaying((p) => !p),
    setSpeed,
    seek: (ms) => setReplayTime(Math.max(0, Math.min(maxTime, ms))),
  };
}
