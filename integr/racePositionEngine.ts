/**
 * racePositionEngine.ts
 * ─────────────────────
 * Bridges your existing scoring system to the live race replay.
 *
 * The key insight: your scoring system already produces everything we need.
 * We just need to translate it into track coordinates + race position.
 *
 * Mapping rules:
 *   qualityScore 0→100   →  race position P20→P1
 *   currentSpeed 0→320   →  how fast the user's car moves along the track path
 *   race_event           →  visual cue on track (spin, collision, boost glow)
 *
 * The 20 real F1 drivers run a pre-recorded replay from OpenF1.
 * The user's car is inserted as P21 at grid start, then overtakes
 * drivers as their quality score crosses position thresholds.
 */

import type { SessionScoringState, ScoreEvent } from "../types";

// ─── Constants ────────────────────────────────────────────────────────────────

// Starting position index along the track path (0.0–1.0)
// We put the user at the back of the grid (just behind all 20 drivers)
const GRID_START_OFFSET = 0.02; // slightly behind P20

// How much track progress per animation frame at base speed (240 km/h equiv)
// Real F1 lap ~90s. At 1x replay speed this feels right.
const BASE_PROGRESS_PER_MS = 1 / 90_000; // full lap in 90 real seconds

// Speed multiplier range: score 0 → 0.6x, score 100 → 1.4x
// This means a perfect cleaner is ~2.3x faster than a non-cleaner
const SPEED_SCALE_MIN = 0.6;
const SPEED_SCALE_MAX = 1.4;

// Visual event duration in ms
const EVENT_FLASH_DURATION = 2000;

// ─── Types ────────────────────────────────────────────────────────────────────

export type VisualCueType =
  | "STRAIGHT_BOOST"   // green glow trail
  | "CORNER_TAKEN"     // blue arc flash
  | "SPIN_OUT"         // red spiral
  | "TYRE_PUNCTURE"    // orange wobble
  | "COLLISION"        // red flash + bounce
  | "FUEL_WASTE"       // grey fade
  | "PIT_STOP_WASTED"  // yellow pit lane icon
  | "OVER_ENGINEERED"  // purple overload
  | "CLEAN_LAP"        // gold trail
  | "NONE";

export interface UserCarState {
  /** 0.0–1.0 progress along the track path */
  trackProgress: number;
  /** 1–20 calculated race position */
  position: number;
  /** km/h shown in telemetry */
  speed: number;
  /** current quality score 0–100 */
  qualityScore: number;
  /** active visual cue */
  visualCue: VisualCueType;
  /** ms remaining on current visual cue */
  cueTimeRemaining: number;
  /** number of completed laps */
  lap: number;
  /** fuel level 0–100 */
  fuel: number;
  /** whether a penalty animation is active */
  isPenalty: boolean;
  /** last hud message */
  hudMessage: string;
}

export interface RaceDriverPosition {
  driverNumber: number;
  /** 0.0–1.0 track progress */
  trackProgress: number;
  position: number;
  lap: number;
}

// ─── Speed calculation ────────────────────────────────────────────────────────

/**
 * Convert scoring state speed (0–320+) into a track speed multiplier.
 * Your scoring system caps practical speed around 320 (240 base + boosts).
 */
export function speedToMultiplier(scoringSpeed: number): number {
  // Normalise 160–320 range to 0–1, clamp outside
  const normalised = Math.max(0, Math.min(1, (scoringSpeed - 160) / 160));
  return SPEED_SCALE_MIN + normalised * (SPEED_SCALE_MAX - SPEED_SCALE_MIN);
}

/**
 * Calculate how much track progress to advance in a given elapsed time,
 * based on the current scoring state speed.
 */
export function calcProgressDelta(
  scoringSpeed: number,
  elapsedMs: number
): number {
  const multiplier = speedToMultiplier(scoringSpeed);
  return BASE_PROGRESS_PER_MS * multiplier * elapsedMs;
}

// ─── Position calculation ─────────────────────────────────────────────────────

/**
 * Given the user's track progress and all real driver positions,
 * calculate what race position (1–20) the user is in.
 *
 * Drivers ahead = those with more track progress (accounting for laps).
 */
export function calcRacePosition(
  userProgress: number,
  userLap: number,
  realDrivers: RaceDriverPosition[]
): number {
  const userAbsolute = userLap + userProgress;
  const driversAhead = realDrivers.filter((d) => {
    const dAbsolute = d.lap + d.trackProgress;
    return dAbsolute > userAbsolute;
  });
  return Math.min(20, driversAhead.length + 1);
}

/**
 * Alternative: derive position directly from quality score.
 * Used for instant feedback when a transform is confirmed.
 * score 0 = P20, score 100 = P1 (linear interpolation).
 */
export function scoreToPosition(qualityScore: number): number {
  return Math.round(20 - (qualityScore / 100) * 19);
}

// ─── Visual cue mapping ───────────────────────────────────────────────────────

export function raceEventToVisualCue(raceEvent: string): VisualCueType {
  const map: Record<string, VisualCueType> = {
    STRAIGHT_BOOST: "STRAIGHT_BOOST",
    CORNER_TAKEN: "CORNER_TAKEN",
    SPIN_OUT: "SPIN_OUT",
    TYRE_PUNCTURE: "TYRE_PUNCTURE",
    COLLISION: "COLLISION",
    FUEL_WASTE: "FUEL_WASTE",
    PIT_STOP_WASTED: "PIT_STOP_WASTED",
    OVER_ENGINEERED: "OVER_ENGINEERED",
    CLEAN_LAP: "CLEAN_LAP",
    SCAN_USEFUL: "NONE",
    SCAN_REDUNDANT: "NONE",
    CAUTION_FLAG: "NONE",
    GRID_READY: "NONE",
  };
  return map[raceEvent] ?? "NONE";
}

// ─── State initialiser ────────────────────────────────────────────────────────

export function createInitialUserCarState(): UserCarState {
  return {
    trackProgress: GRID_START_OFFSET,
    position: 20,
    speed: 240,
    qualityScore: 0,
    visualCue: "NONE",
    cueTimeRemaining: 0,
    lap: 1,
    fuel: 65,
    isPenalty: false,
    hudMessage: "Grid loaded — start cleaning",
  };
}

// ─── State updater (call on every confirmed score event) ──────────────────────

export function applyScoreEventToCarState(
  current: UserCarState,
  scoreEvent: ScoreEvent,
  scoringState: SessionScoringState
): UserCarState {
  const visualCue = raceEventToVisualCue(scoreEvent.race_event);
  const isPenalty = scoreEvent.action_category === "D";

  return {
    ...current,
    speed: scoringState.currentSpeed,
    qualityScore: scoreEvent.quality_score,
    fuel: scoringState.currentFuel,
    visualCue,
    cueTimeRemaining: visualCue !== "NONE" ? EVENT_FLASH_DURATION : 0,
    isPenalty,
    hudMessage: scoreEvent.hud_message,
    // Position is recalculated by the animation loop based on track progress.
    // But we also snap it based on score for immediate visual feedback.
    position: scoreToPosition(scoreEvent.quality_score),
  };
}

// ─── Frame tick (call every animation frame) ──────────────────────────────────

export function tickUserCar(
  current: UserCarState,
  elapsedMs: number,
  realDrivers: RaceDriverPosition[],
  totalLaps: number
): UserCarState {
  const progressDelta = calcProgressDelta(current.speed, elapsedMs);
  let newProgress = current.trackProgress + progressDelta;
  let newLap = current.lap;

  // Lap rollover
  if (newProgress >= 1.0) {
    newProgress -= 1.0;
    newLap = Math.min(totalLaps, newLap + 1);
  }

  const position = calcRacePosition(newProgress, newLap, realDrivers);
  const cueTimeRemaining = Math.max(0, current.cueTimeRemaining - elapsedMs);

  return {
    ...current,
    trackProgress: newProgress,
    lap: newLap,
    position,
    cueTimeRemaining,
    visualCue: cueTimeRemaining > 0 ? current.visualCue : "NONE",
    isPenalty: cueTimeRemaining > 0 ? current.isPenalty : false,
  };
}
