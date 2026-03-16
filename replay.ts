import type { ActionType, Layer, ScoreEvent } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnimationType =
  | "car_accelerate"
  | "corner_clean"
  | "corner_wide"
  | "yellow_flag"
  | "car_spin"
  | "tyre_blown"
  | "car_collision"
  | "pit_stop_short"
  | "pit_stop_long"
  | "car_fastest"
  | "car_overtaken"
  | "car_slow";

export interface ReplayEntry {
  timestamp_ms: number;
  race_event: string;
  action_type: ActionType;
  speed_at_event: number;
  track_position: number;   // 0.0 – 1.0, progress around the track
  animation: AnimationType;
  duration_ms: number;
  hud_message: string;
  is_pit_stop: boolean;
}

export interface ReplayBuffer {
  entries: ReplayEntry[];
  session_start_ms: number;
  tier_achieved: Layer;
  final_quality_score: number;
  locked_errors: string[];
}

export interface ReplaySummary {
  final_lap_time_ms: number;
  final_lap_time_display: string;
  tier_achieved: Layer;
  quality_score: number;
  total_incidents: number;
  pit_stop_count: number;
  is_perfect_lap: boolean;
}

// ─── Event → Animation mapping ────────────────────────────────────────────────
// Mirrors the table in promptIntegration.md exactly

const EVENT_TO_ANIMATION: Record<string, { animation: AnimationType; duration_ms: number }> = {
  STRAIGHT_BOOST:  { animation: "car_accelerate",  duration_ms: 800  },
  CORNER_TAKEN:    { animation: "corner_clean",     duration_ms: 1200 },
  CORNER_FAILED:   { animation: "corner_wide",      duration_ms: 1500 },
  CAUTION_FLAG:    { animation: "yellow_flag",      duration_ms: 2000 },
  SPIN_OUT:        { animation: "car_spin",         duration_ms: 2500 },
  TYRE_PUNCTURE:   { animation: "tyre_blown",       duration_ms: 1800 },
  COLLISION:       { animation: "car_collision",    duration_ms: 2200 },
  FUEL_WASTE:      { animation: "pit_stop_short",   duration_ms: 1000 },
  PIT_STOP_WASTED: { animation: "pit_stop_long",    duration_ms: 2000 },
  OVER_ENGINEERED: { animation: "pit_stop_long",    duration_ms: 2000 },
  FLAT_TYRE:       { animation: "tyre_blown",       duration_ms: 3500 },
  ENGINE_DAMAGE:   { animation: "car_slow",         duration_ms: 4000 },
  CLEAN_LAP:       { animation: "car_fastest",      duration_ms: 3000 },
  POSITION_LOST:   { animation: "car_overtaken",    duration_ms: 1500 },
};

const PIT_STOP_ANIMATIONS: Set<AnimationType> = new Set([
  "pit_stop_short",
  "pit_stop_long",
  "tyre_blown",
]);

const DEFAULT_ANIMATION: { animation: AnimationType; duration_ms: number } = {
  animation: "car_accelerate",
  duration_ms: 800,
};

// ─── Buffer management ────────────────────────────────────────────────────────

export function createReplayBuffer(): ReplayBuffer {
  return {
    entries: [],
    session_start_ms: Date.now(),
    tier_achieved: "bronze",
    final_quality_score: 0,
    locked_errors: [],
  };
}

/**
 * Call this every time the player confirms a SQL action.
 * Appends a new entry to the replay buffer based on the ScoreEvent.
 */
export function appendReplayEntry(
  buffer: ReplayBuffer,
  scoreEvent: ScoreEvent,
  currentTrackPosition: number,
): ReplayBuffer {
  const race_event = scoreEvent.race_event;
  const mapping = EVENT_TO_ANIMATION[race_event] ?? DEFAULT_ANIMATION;
  const timestamp_ms = Date.now() - buffer.session_start_ms;

  const entry: ReplayEntry = {
    timestamp_ms,
    race_event,
    action_type: scoreEvent.action_type,
    speed_at_event: scoreEvent.speed_delta,
    track_position: currentTrackPosition,
    animation: mapping.animation,
    duration_ms: mapping.duration_ms,
    hud_message: scoreEvent.hud_message,
    is_pit_stop: PIT_STOP_ANIMATIONS.has(mapping.animation),
  };

  return {
    ...buffer,
    entries: [...buffer.entries, entry],
  };
}

/**
 * Finalise the buffer when the player qualifies.
 * Locks in the tier, score, and errors before passing to the replay component.
 */
export function finaliseReplayBuffer(
  buffer: ReplayBuffer,
  tier: Layer,
  quality_score: number,
  locked_errors: string[],
): ReplayBuffer {
  return {
    ...buffer,
    tier_achieved: tier,
    final_quality_score: quality_score,
    locked_errors,
  };
}

// ─── Track position advancement ───────────────────────────────────────────────
// Each action type advances the car's track position by a different amount.
// Bad actions advance very little (crawling) or move backwards slightly (spin).

const POSITION_DELTAS: Record<string, number> = {
  car_accelerate: 0.06,
  corner_clean:   0.10,
  corner_wide:    0.02,   // took the corner badly, barely advanced
  yellow_flag:    0.01,   // slowed right down
  car_spin:      -0.02,   // lost ground
  tyre_blown:     0.00,   // stationary in pits
  car_collision:  0.00,
  pit_stop_short: 0.00,
  pit_stop_long:  0.00,
  car_fastest:    0.14,   // flying lap
  car_overtaken:  0.01,
  car_slow:       0.01,
};

export function advanceTrackPosition(
  current: number,
  animation: AnimationType,
): number {
  const delta = POSITION_DELTAS[animation] ?? 0.03;
  return Math.min(1, Math.max(0, current + delta));
}

// ─── Results calculation ──────────────────────────────────────────────────────
// Formula from promptIntegration.md

const BASE_LAP_TIME_MS = 90_000; // 1 min 30 sec baseline
const TIER_BONUS_MS: Record<Layer, number> = {
  bronze: 0,
  silver: 3_000,
  gold:   8_000,
};

export function calculateResults(buffer: ReplayBuffer): ReplaySummary {
  const { entries, tier_achieved, final_quality_score, locked_errors } = buffer;

  const speed_bonus = final_quality_score * 150; // up to ~13,800ms off base time at 92%
  const penalty_ms  = locked_errors.length * 1_200;
  const tier_bonus  = TIER_BONUS_MS[tier_achieved];
  const wall_clock  = (Date.now() - buffer.session_start_ms) * 0.1;

  const final_lap_time_ms = Math.max(
    40_000, // floor: no lap under 40s
    BASE_LAP_TIME_MS - speed_bonus - tier_bonus + penalty_ms + wall_clock,
  );

  const pit_stop_count = entries.filter(e => e.is_pit_stop).length;
  const total_incidents = entries.filter(e =>
    ["car_spin", "tyre_blown", "car_collision", "corner_wide", "yellow_flag"].includes(e.animation)
  ).length;

  const is_perfect_lap = tier_achieved === "gold" && locked_errors.length === 0;

  return {
    final_lap_time_ms,
    final_lap_time_display: formatLapTime(final_lap_time_ms),
    tier_achieved,
    quality_score: final_quality_score,
    total_incidents,
    pit_stop_count,
    is_perfect_lap,
  };
}

function formatLapTime(ms: number): string {
  const total_s = Math.floor(ms / 1000);
  const minutes = Math.floor(total_s / 60);
  const seconds = total_s % 60;
  const millis  = ms % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}
