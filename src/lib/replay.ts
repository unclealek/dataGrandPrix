import type { Layer, ScoreEvent } from "../types";

export type ReplayAnimation =
  | "car_accelerate"
  | "corner_clean"
  | "corner_wide"
  | "yellow_flag"
  | "car_spin"
  | "tyre_blown"
  | "car_collision"
  | "pit_stop_short"
  | "pit_stop_long"
  | "engine_smoke"
  | "car_fastest"
  | "car_overtaken";

export interface ReplayEntry {
  timestamp_ms: number;
  race_event: string;
  action_type: string;
  speed_at_event: number;
  track_position: number;
  animation: ReplayAnimation;
  duration_ms: number;
  hud_message: string;
  quality_score: number;
}

export interface ReplayBuffer {
  entries: ReplayEntry[];
  totalDurationMs: number;
  tierAchieved: Layer | null;
  finalQualityScore: number;
  lockedErrors: string[];
}

export interface ReplaySummary {
  finalLapTimeMs: number;
  tierAchieved: Layer;
  finalQualityScore: number;
  incidentCount: number;
  totalReplayDurationMs: number;
  lockedErrors: string[];
}

const BASE_LAP_TIME_MS = 90_000;
const SPEED_BONUS_MULTIPLIER_MS = 120;
const TIER_BONUS_MS: Record<Layer, number> = {
  bronze: 0,
  silver: 3_000,
  gold: 8_000,
};

const animationMap: Record<string, { animation: ReplayAnimation; durationMs: number }> = {
  STRAIGHT_BOOST: { animation: "car_accelerate", durationMs: 800 },
  CORNER_TAKEN: { animation: "corner_clean", durationMs: 1200 },
  CORNER_FAILED: { animation: "corner_wide", durationMs: 1500 },
  CAUTION_FLAG: { animation: "yellow_flag", durationMs: 2000 },
  SPIN_OUT: { animation: "car_spin", durationMs: 2500 },
  TYRE_PUNCTURE: { animation: "tyre_blown", durationMs: 1800 },
  COLLISION: { animation: "car_collision", durationMs: 2200 },
  FUEL_WASTE: { animation: "pit_stop_short", durationMs: 1000 },
  PIT_STOP_WASTED: { animation: "pit_stop_long", durationMs: 2000 },
  OVER_ENGINEERED: { animation: "pit_stop_long", durationMs: 2000 },
  FLAT_TYRE: { animation: "tyre_blown", durationMs: 3500 },
  ENGINE_DAMAGE: { animation: "engine_smoke", durationMs: 4000 },
  CLEAN_LAP: { animation: "car_fastest", durationMs: 3000 },
  POSITION_LOST: { animation: "car_overtaken", durationMs: 1500 },
  QUALIFIED: { animation: "corner_clean", durationMs: 1200 },
  GRID_READY: { animation: "car_accelerate", durationMs: 800 },
};

function clampTrackPosition(position: number) {
  return Number(Math.max(0, Math.min(1, position)).toFixed(4));
}

function mapTrackDelta(scoreEvent: ScoreEvent) {
  if (scoreEvent.race_event === "CLEAN_LAP") {
    return 0.12;
  }

  if (scoreEvent.action_category === "A") {
    return 0.06;
  }

  if (scoreEvent.action_category === "B") {
    return 0.1;
  }

  if (scoreEvent.action_category === "C") {
    if (scoreEvent.action_type === "SCAN_USEFUL") {
      return 0;
    }
    return -0.02;
  }

  const penaltyDeltas: Record<string, number> = {
    SPIN_OUT: -0.05,
    TYRE_PUNCTURE: -0.04,
    COLLISION: -0.06,
    FUEL_WASTE: -0.03,
    PIT_STOP_WASTED: -0.04,
    OVER_ENGINEERED: -0.04,
    FLAT_TYRE: -0.08,
    ENGINE_DAMAGE: -0.12,
    POSITION_LOST: -0.03,
    QUALIFY_GATE: -0.08,
  };

  return penaltyDeltas[scoreEvent.race_event] ?? -0.03;
}

export function createReplayBuffer(): ReplayBuffer {
  return {
    entries: [],
    totalDurationMs: 0,
    tierAchieved: null,
    finalQualityScore: 0,
    lockedErrors: [],
  };
}

export function mapReplayAnimation(raceEvent: string) {
  return animationMap[raceEvent] ?? animationMap.STRAIGHT_BOOST;
}

export function advanceTrackPosition(position: number, scoreEvent: ScoreEvent) {
  return clampTrackPosition(position + mapTrackDelta(scoreEvent));
}

export function appendReplayEntry(
  replayBuffer: ReplayBuffer,
  scoreEvent: ScoreEvent,
  params: { speedAtEvent: number; trackPosition: number },
): ReplayBuffer {
  const mapped = mapReplayAnimation(scoreEvent.race_event);
  const timestampMs =
    replayBuffer.entries.length === 0
      ? 0
      : replayBuffer.entries[replayBuffer.entries.length - 1].timestamp_ms +
        replayBuffer.entries[replayBuffer.entries.length - 1].duration_ms;

  const entry: ReplayEntry = {
    timestamp_ms: timestampMs,
    race_event: scoreEvent.race_event,
    action_type: scoreEvent.action_type,
    speed_at_event: params.speedAtEvent,
    track_position: clampTrackPosition(params.trackPosition),
    animation: mapped.animation,
    duration_ms: mapped.durationMs,
    hud_message: scoreEvent.hud_message,
    quality_score: scoreEvent.quality_score,
  };

  const entries = [...replayBuffer.entries, entry];

  return {
    ...replayBuffer,
    entries,
    totalDurationMs: entries.reduce((sum, item) => sum + item.duration_ms, 0),
  };
}

export function finaliseReplayBuffer(
  replayBuffer: ReplayBuffer,
  tierAchieved: Layer,
  finalQualityScore: number,
  lockedErrors: string[],
): ReplayBuffer {
  return {
    ...replayBuffer,
    tierAchieved,
    finalQualityScore,
    lockedErrors,
    totalDurationMs: replayBuffer.entries.reduce((sum, item) => sum + item.duration_ms, 0),
  };
}

export function summariseReplay(replayBuffer: ReplayBuffer): ReplaySummary | null {
  if (!replayBuffer.tierAchieved) {
    return null;
  }

  const finalLapTimeMs =
    BASE_LAP_TIME_MS -
    replayBuffer.finalQualityScore * SPEED_BONUS_MULTIPLIER_MS +
    replayBuffer.lockedErrors.length * 1_200 -
    TIER_BONUS_MS[replayBuffer.tierAchieved];

  return {
    finalLapTimeMs: Math.max(45_000, Math.round(finalLapTimeMs)),
    tierAchieved: replayBuffer.tierAchieved,
    finalQualityScore: replayBuffer.finalQualityScore,
    incidentCount: replayBuffer.entries.filter((entry) =>
      ["car_spin", "tyre_blown", "car_collision", "engine_smoke", "car_overtaken"].includes(entry.animation),
    ).length,
    totalReplayDurationMs: replayBuffer.totalDurationMs,
    lockedErrors: replayBuffer.lockedErrors,
  };
}

export function formatLapTime(timeMs: number) {
  const minutes = Math.floor(timeMs / 60_000);
  const seconds = Math.floor((timeMs % 60_000) / 1_000);
  const milliseconds = String(timeMs % 1_000).padStart(3, "0");
  return `${minutes}:${String(seconds).padStart(2, "0")}.${milliseconds}`;
}
