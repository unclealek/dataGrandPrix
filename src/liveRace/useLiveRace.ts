import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ScoreEvent, SessionScoringState } from "../types";
import type { DriverSnapshot, RaceField } from "./fetchRaceField";
import {
  applyScoreEventToCarState,
  createInitialUserCarState,
  createStagedUserCarState,
  tickUserCar,
  type RaceDriverPosition,
  type UserCarState,
} from "./racePositionEngine";

export interface LeaderboardEntry {
  isUser: boolean;
  driverNumber: number;
  acronym: string;
  teamColor: string;
  position: number;
  lap: number;
  speed: number;
  isOut: boolean;
}

export interface LiveRaceState {
  userCar: UserCarState;
  realDriverFrames: Record<number, DriverSnapshot>;
  leaderboard: LeaderboardEntry[];
  replayTime: number;
  leadLap: number;
  isPlaying: boolean;
  progress: number;
  startRace: () => void;
}

export const USER_DRIVER_NUMBER = 0;
export const USER_ACRONYM = "YOU";
export const USER_COLOR = "#00e5ff";
const START_SPREAD_WINDOW_MS = 8_000;
const START_SPREAD_RANGE = 0.035;

function interpolateProgress(from: number, to: number, ratio: number) {
  let delta = to - from;
  if (Math.abs(delta) > 0.5) {
    delta += delta > 0 ? -1 : 1;
  }
  const value = from + delta * ratio;
  return value < 0 ? value + 1 : value >= 1 ? value - 1 : value;
}

function gridStartOffset(position: number) {
  const clamped = Math.max(1, Math.min(20, position || 20));
  return ((20 - clamped) / 19) * START_SPREAD_RANGE;
}

export function useLiveRace(
  field: RaceField | null,
  scoringState: SessionScoringState | null,
  lastScoreEvent: ScoreEvent | null,
): LiveRaceState {
  const [replayTime, setReplayTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [userCar, setUserCar] = useState<UserCarState>(createInitialUserCarState);

  const rafRef = useRef<number | null>(null);
  const lastRealTimeRef = useRef<number | null>(null);
  const replayTimeRef = useRef(0);
  const scoreEventRef = useRef<ScoreEvent | null>(null);

  const maxTime = field ? field.timestamps[field.timestamps.length - 1] ?? 0 : 0;

  const getFramesAt = useCallback(
    (timestamp: number) => {
      if (!field || field.timestamps.length === 0) {
        return {};
      }

      const timestamps = field.timestamps;
      if (timestamp <= timestamps[0]) {
        return field.frames[timestamps[0]] ?? {};
      }

      let lower = 0;
      let upper = timestamps.length - 1;
      while (lower < upper) {
        const middle = (lower + upper + 1) >> 1;
        if (timestamps[middle] <= timestamp) {
          lower = middle;
        } else {
          upper = middle - 1;
        }
      }

      const lowerTimestamp = timestamps[lower];
      const upperIndex = Math.min(timestamps.length - 1, lower + 1);
      const upperTimestamp = timestamps[upperIndex];
      const lowerFrames = field.frames[lowerTimestamp] ?? {};
      const upperFrames = field.frames[upperTimestamp] ?? lowerFrames;

      if (upperTimestamp === lowerTimestamp) {
        return lowerFrames;
      }

      const ratio = (timestamp - lowerTimestamp) / Math.max(1, upperTimestamp - lowerTimestamp);
      const interpolated: Record<number, DriverSnapshot> = {};
      const driverNumbers = new Set([
        ...Object.keys(lowerFrames).map(Number),
        ...Object.keys(upperFrames).map(Number),
      ]);

      for (const driverNumber of driverNumbers) {
        const from = lowerFrames[driverNumber] ?? upperFrames[driverNumber];
        const to = upperFrames[driverNumber] ?? lowerFrames[driverNumber];
        if (!from || !to) {
          continue;
        }

        interpolated[driverNumber] = {
          driverNumber,
          trackProgress: interpolateProgress(from.trackProgress, to.trackProgress, ratio),
          lap: ratio > 0.7 ? to.lap : from.lap,
          position: Math.round(from.position + (to.position - from.position) * ratio),
          speed: Math.round(from.speed + (to.speed - from.speed) * ratio),
          gear: ratio > 0.5 ? to.gear : from.gear,
          drs: ratio > 0.5 ? to.drs : from.drs,
        };

        if (timestamp < START_SPREAD_WINDOW_MS) {
          const fade = 1 - timestamp / START_SPREAD_WINDOW_MS;
          interpolated[driverNumber].trackProgress = interpolateProgress(
            interpolated[driverNumber].trackProgress,
            interpolated[driverNumber].trackProgress + gridStartOffset(interpolated[driverNumber].position),
            fade,
          );
        }
      }

      return interpolated;
    },
    [field],
  );

  useEffect(() => {
    if (!field) {
      setReplayTime(0);
      replayTimeRef.current = 0;
      setIsPlaying(false);
      setUserCar(createInitialUserCarState());
      scoreEventRef.current = null;
    }
  }, [field]);

  useEffect(() => {
    if (!lastScoreEvent || lastScoreEvent === scoreEventRef.current || !scoringState) {
      return;
    }
    scoreEventRef.current = lastScoreEvent;
    setUserCar((current) => applyScoreEventToCarState(current, lastScoreEvent, scoringState));
  }, [lastScoreEvent, scoringState]);

  const tick = useCallback(
    (realNow: number) => {
      if (!field) {
        return;
      }

      if (lastRealTimeRef.current !== null) {
        const elapsedMs = realNow - lastRealTimeRef.current;
        const nextReplayTime = Math.min(maxTime, replayTimeRef.current + elapsedMs);
        replayTimeRef.current = nextReplayTime;
        setReplayTime(nextReplayTime);

        const currentFrames = getFramesAt(nextReplayTime);
        const realDriverPositions: RaceDriverPosition[] = Object.values(currentFrames).map((frame) => ({
          driverNumber: frame.driverNumber,
          trackProgress: frame.trackProgress,
          position: frame.position,
          lap: frame.lap,
        }));

        setUserCar((current) => tickUserCar(current, elapsedMs, realDriverPositions, field.totalLaps));

        if (nextReplayTime >= maxTime) {
          setIsPlaying(false);
          lastRealTimeRef.current = null;
          return;
        }
      }

      lastRealTimeRef.current = realNow;
      rafRef.current = window.requestAnimationFrame(tick);
    },
    [field, getFramesAt, maxTime],
  );

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      lastRealTimeRef.current = null;
      return;
    }

    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isPlaying, tick]);

  const realDriverFrames = useMemo(() => getFramesAt(replayTime), [getFramesAt, replayTime]);

  const leadLap = useMemo(
    () => Object.values(realDriverFrames).reduce((maxLap, frame) => Math.max(maxLap, frame.lap), 1),
    [realDriverFrames],
  );

  const leaderboard = useMemo(() => {
    const entries: LeaderboardEntry[] = [
      {
        isUser: true,
        driverNumber: USER_DRIVER_NUMBER,
        acronym: USER_ACRONYM,
        teamColor: USER_COLOR,
        position: userCar.position,
        lap: userCar.lap,
        speed: userCar.speed,
        isOut: false,
      },
    ];

    if (field) {
      for (const [driverNumberString, frame] of Object.entries(realDriverFrames)) {
        const driverNumber = Number(driverNumberString);
        const driver = field.drivers[driverNumber];
        if (!driver) {
          continue;
        }

        entries.push({
          isUser: false,
          driverNumber,
          acronym: driver.acronym,
          teamColor: driver.teamColor,
          position: frame.position,
          lap: frame.lap,
          speed: frame.speed,
          isOut: frame.position > 20,
        });
      }
    }

    return entries.sort((a, b) => a.position - b.position);
  }, [field, realDriverFrames, userCar]);

  return {
    userCar,
    realDriverFrames,
    leaderboard,
    replayTime,
    leadLap,
    isPlaying,
    progress: maxTime > 0 ? replayTime / maxTime : 0,
    startRace: () => {
      replayTimeRef.current = 0;
      setReplayTime(0);
      setUserCar(createStagedUserCarState(scoringState, lastScoreEvent));
      setIsPlaying(true);
    },
  };
}
