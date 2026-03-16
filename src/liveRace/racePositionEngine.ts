import type { ScoreEvent, SessionScoringState } from "../types";

// GRID_START_OFFSET removed — grid stagger is now owned entirely by fetchRaceField.ts.
// Real drivers are staggered there. The user car starts at progress 0 (back of grid)
// and earns position through SQL cleaning, which is the game mechanic.
const BASE_PROGRESS_PER_MS = 1 / 90_000;
const SPEED_SCALE_MIN = 0.55;
const SPEED_SCALE_MAX = 1.05;
const EVENT_FLASH_DURATION_MS = 2000;
const TOTAL_RACE_CARS = 21;

function immediateProgressDelta(scoreEvent: ScoreEvent, current: UserCarState) {
  const qualityGain = Math.max(0, scoreEvent.quality_score - current.qualityScore);
  const speedGain = Math.max(0, scoreEvent.speed_delta);

  if (scoreEvent.action_category === "D") {
    return -0.002;
  }

  if (scoreEvent.race_event === "CLEAN_LAP") {
    return 0.0085;
  }

  if (scoreEvent.action_category === "A") {
    return Math.min(0.0045, 0.0018 + qualityGain * 0.00014 + speedGain * 0.00005);
  }

  if (scoreEvent.action_category === "B") {
    return Math.min(0.0065, 0.0028 + qualityGain * 0.00015 + speedGain * 0.00006);
  }

  return 0.0012;
}

export type VisualCueType =
  | "STRAIGHT_BOOST"
  | "CORNER_TAKEN"
  | "SPIN_OUT"
  | "TYRE_PUNCTURE"
  | "COLLISION"
  | "FUEL_WASTE"
  | "PIT_STOP_WASTED"
  | "OVER_ENGINEERED"
  | "CLEAN_LAP"
  | "NONE";

export interface UserCarState {
  trackProgress: number;
  position: number;
  speed: number;
  qualityScore: number;
  visualCue: VisualCueType;
  cueTimeRemaining: number;
  lap: number;
  fuel: number;
  isPenalty: boolean;
  hudMessage: string;
}

export interface RaceDriverPosition {
  driverNumber: number;
  trackProgress: number;
  position: number;
  lap: number;
}

export function speedToMultiplier(scoringSpeed: number) {
  const normalized = Math.max(0, Math.min(1, (scoringSpeed - 180) / 140));
  return SPEED_SCALE_MIN + normalized * (SPEED_SCALE_MAX - SPEED_SCALE_MIN);
}

export function calcProgressDelta(scoringSpeed: number, elapsedMs: number) {
  return BASE_PROGRESS_PER_MS * speedToMultiplier(scoringSpeed) * elapsedMs;
}

export function calcRacePosition(userProgress: number, userLap: number, realDrivers: RaceDriverPosition[]) {
  const userAbsolute = userLap + userProgress;
  const driversAhead = realDrivers.filter((driver) => driver.lap + driver.trackProgress > userAbsolute);
  return Math.min(TOTAL_RACE_CARS, driversAhead.length + 1);
}

export function raceEventToVisualCue(raceEvent: string): VisualCueType {
  const cueMap: Record<string, VisualCueType> = {
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
    QUALIFIED: "NONE",
  };

  return cueMap[raceEvent] ?? "NONE";
}

export function createInitialUserCarState(): UserCarState {
  return {
    trackProgress: 0, // starts at back of grid; real drivers are staggered ahead in fetchRaceField
    position: TOTAL_RACE_CARS,
    speed: 240,
    qualityScore: 0,
    visualCue: "NONE",
    cueTimeRemaining: 0,
    lap: 1,
    fuel: 65,
    isPenalty: false,
    hudMessage: "Grid loaded - start cleaning",
  };
}

export function createStagedUserCarState(
  scoringState: SessionScoringState | null,
  lastScoreEvent: ScoreEvent | null,
): UserCarState {
  const base = createInitialUserCarState();
  if (!scoringState) {
    return base;
  }

  const qualityScore = lastScoreEvent?.quality_score ?? base.qualityScore;
  const hudMessage = lastScoreEvent?.hud_message ?? base.hudMessage;

  return {
    ...base,
    speed: scoringState.currentSpeed,
    fuel: scoringState.currentFuel,
    qualityScore,
    hudMessage,
    position: base.position,
  };
}

export function applyScoreEventToCarState(
  current: UserCarState,
  scoreEvent: ScoreEvent,
  scoringState: SessionScoringState,
  realDrivers: RaceDriverPosition[],
): UserCarState {
  const visualCue = raceEventToVisualCue(scoreEvent.race_event);
  const nextTrackProgress = Math.max(0, Math.min(0.995, current.trackProgress + immediateProgressDelta(scoreEvent, current)));
  const nextPosition = calcRacePosition(nextTrackProgress, current.lap, realDrivers);

  return {
    ...current,
    trackProgress: nextTrackProgress,
    speed: scoringState.currentSpeed,
    qualityScore: scoreEvent.quality_score,
    fuel: scoringState.currentFuel,
    visualCue,
    cueTimeRemaining: visualCue === "NONE" ? 0 : EVENT_FLASH_DURATION_MS,
    isPenalty: scoreEvent.action_category === "D",
    hudMessage: scoreEvent.hud_message,
    position: nextPosition,
  };
}

export function tickUserCar(
  current: UserCarState,
  elapsedMs: number,
  realDrivers: RaceDriverPosition[],
  totalLaps: number,
): UserCarState {
  let nextProgress = current.trackProgress + calcProgressDelta(current.speed, elapsedMs);
  let nextLap = current.lap;

  if (nextProgress >= 1) {
    nextProgress -= 1;
    nextLap = Math.min(totalLaps, nextLap + 1);
  }

  const cueTimeRemaining = Math.max(0, current.cueTimeRemaining - elapsedMs);

  return {
    ...current,
    trackProgress: nextProgress,
    lap: nextLap,
    position: calcRacePosition(nextProgress, nextLap, realDrivers),
    cueTimeRemaining,
    visualCue: cueTimeRemaining > 0 ? current.visualCue : "NONE",
    isPenalty: cueTimeRemaining > 0 ? current.isPenalty : false,
  };
}
