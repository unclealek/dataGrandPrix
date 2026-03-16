import circuitData from "../generated/circuit.json";

export interface F1Driver {
  number: number;
  acronym: string;
  fullName: string;
  teamColor: string;
}

export interface DriverSnapshot {
  driverNumber: number;
  trackProgress: number;
  lap: number;
  position: number;
  speed: number;
  gear: number;
  drs: boolean;
}

export interface RaceField {
  sessionKey: number;
  sessionName: string;
  circuit: string;
  totalLaps: number;
  drivers: Record<number, F1Driver>;
  timestamps: number[];
  frames: Record<number, Record<number, DriverSnapshot>>;
  trackPath: { x: number; y: number }[];
}

export interface SessionSummary {
  sessionKey: number;
  label: string;
  circuit: string;
  date: string;
}

export async function listRaceSessions(year = 2024): Promise<SessionSummary[]> {
  const response = await fetch(`https://api.openf1.org/v1/sessions?year=${year}&session_type=Race`);
  if (!response.ok) {
    throw new Error(`OpenF1 sessions failed: ${response.status}`);
  }

  const data = (await response.json()) as Array<Record<string, unknown>>;
  return data
    .sort((a, b) => String(b.date_start).localeCompare(String(a.date_start)))
    .map((session) => ({
      sessionKey: Number(session.session_key),
      label: `${session.year} - ${session.location} GP`,
      circuit: String(session.circuit_short_name ?? session.location ?? "Unknown"),
      date: String(session.date_start ?? ""),
    }));
}

const FALLBACK_BASE_PROGRESS_PER_MS = 1 / 90_000;

function enforceSyntheticForwardMotion(
  timestamps: number[],
  frames: Record<number, Record<number, DriverSnapshot>>,
  driverNumbers: number[],
  totalLaps: number,
) {
  for (const driverNumber of driverNumbers) {
    let previousAbsolute: number | null = null;

    for (let index = 0; index < timestamps.length; index += 1) {
      const timestamp = timestamps[index];
      const frame = frames[timestamp]?.[driverNumber];
      if (!frame) {
        continue;
      }

      const elapsedMs = index > 0 ? timestamps[index] - timestamps[index - 1] : 0;
      const speedKmh = frame.speed > 0 ? frame.speed : 220;
      const minAdvance = FALLBACK_BASE_PROGRESS_PER_MS * (speedKmh / 250) * elapsedMs;

      let absoluteProgress = (Math.max(1, frame.lap) - 1) + frame.trackProgress;

      if (previousAbsolute !== null && absoluteProgress < previousAbsolute) {
        absoluteProgress = previousAbsolute + minAdvance;
      }

      const clampedLap = Math.min(totalLaps, Math.floor(absoluteProgress) + 1);
      const wrappedProgress = absoluteProgress - Math.floor(absoluteProgress);

      frames[timestamp][driverNumber] = {
        ...frame,
        lap: clampedLap,
        trackProgress: wrappedProgress,
      };

      previousAbsolute = (clampedLap - 1) + wrappedProgress;
    }
  }
}

export async function fetchRaceField(
  sessionKey: number,
  onProgress?: (message: string) => void,
): Promise<RaceField> {
  const log = onProgress ?? (() => undefined);
  const debugEnabled = typeof window !== "undefined";

  async function safeFetchArray(url: string, failureMessage: string) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        log(`${failureMessage} (${response.status}). Falling back...`);
        return [] as Array<Record<string, unknown>>;
      }
      return (await response.json()) as Array<Record<string, unknown>>;
    } catch {
      log(`${failureMessage}. Falling back...`);
      return [] as Array<Record<string, unknown>>;
    }
  }

  log("Loading session info...");
  const [sessionResponse, driverResponse] = await Promise.all([
    fetch(`https://api.openf1.org/v1/sessions?session_key=${sessionKey}`),
    fetch(`https://api.openf1.org/v1/drivers?session_key=${sessionKey}`),
  ]);

  if (!sessionResponse.ok || !driverResponse.ok) {
    throw new Error("Failed to load race metadata from OpenF1.");
  }

  const sessions = (await sessionResponse.json()) as Array<Record<string, unknown>>;
  const driverData = (await driverResponse.json()) as Array<Record<string, unknown>>;
  const session = sessions[0];
  if (!session) {
    throw new Error(`No session found for session_key=${sessionKey}`);
  }

  const origin = new Date(String(session.date_start)).getTime();

  log("Loading car positions...");
  let locations: Array<Record<string, unknown>> = [];
  let hasLocationData = false;
  try {
    const locationResponse = await fetch(`https://api.openf1.org/v1/location?session_key=${sessionKey}`);
    if (locationResponse.ok) {
      locations = (await locationResponse.json()) as Array<Record<string, unknown>>;
      hasLocationData = locations.length > 0;
    } else {
      log(`Location feed unavailable (${locationResponse.status}). Falling back to synthetic track progress...`);
    }
  } catch {
    log("Location feed unavailable. Falling back to synthetic track progress...");
  }

  log("Loading car telemetry...");
  const carData = await safeFetchArray(
    `https://api.openf1.org/v1/car_data?session_key=${sessionKey}`,
    "Telemetry feed unavailable",
  );

  log("Loading race positions...");
  const positions = await safeFetchArray(
    `https://api.openf1.org/v1/position?session_key=${sessionKey}`,
    "Position feed unavailable",
  );

  log("Loading lap data...");
  const lapResponse = await fetch(`https://api.openf1.org/v1/laps?session_key=${sessionKey}`);
  if (!lapResponse.ok) {
    throw new Error("Failed to load lap data from OpenF1.");
  }
  const laps = (await lapResponse.json()) as Array<Record<string, unknown>>;

  log("Processing data...");

  const drivers: Record<number, F1Driver> = {};
  for (const driver of driverData) {
    const number = Number(driver.driver_number);
    drivers[number] = {
      number,
      acronym: String(driver.name_acronym ?? `D${number}`),
      fullName: String(driver.full_name ?? `Driver ${number}`),
      teamColor: driver.team_colour ? `#${driver.team_colour}` : "#ffffff",
    };
  }

  let trackPath: { x: number; y: number }[] = circuitData.points;
  let pointToTrackProgress: ((pointX: number, pointY: number) => number) | null = null;

  if (hasLocationData) {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const item of locations) {
      const x = Number(item.x);
      const y = Number(item.y);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const nx = (value: number) => (value - minX) / rangeX;
    const ny = (value: number) => (value - minY) / rangeY;

    const uniquePoints = Array.from(
      new Map(
        locations.map((item) => [
          `${Math.round(Number(item.x) / 10)},${Math.round(Number(item.y) / 10)}`,
          { x: nx(Number(item.x)), y: ny(Number(item.y)) },
        ]),
      ).values(),
    );

    const centroidX = uniquePoints.reduce((sum, point) => sum + point.x, 0) / Math.max(uniquePoints.length, 1);
    const centroidY = uniquePoints.reduce((sum, point) => sum + point.y, 0) / Math.max(uniquePoints.length, 1);
    const sortedPoints = [...uniquePoints].sort(
      (a, b) => Math.atan2(a.y - centroidY, a.x - centroidX) - Math.atan2(b.y - centroidY, b.x - centroidX),
    );
    const thinningStep = Math.max(1, Math.floor(sortedPoints.length / 320));
    trackPath = sortedPoints.filter((_, index) => index % thinningStep === 0);

    pointToTrackProgress = (pointX: number, pointY: number) => {
      const normalizedX = nx(pointX);
      const normalizedY = ny(pointY);
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < trackPath.length; index += 1) {
        const distance = Math.hypot(normalizedX - trackPath[index].x, normalizedY - trackPath[index].y);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      }
      return bestIndex / Math.max(trackPath.length, 1);
    };
  }

  type OpenF1TimedRecord = { date: string;[key: string]: unknown };
  type RecordsByDriver = Record<number, OpenF1TimedRecord[]>;

  const locationsByDriver: RecordsByDriver = {};
  const telemetryByDriver: RecordsByDriver = {};
  const positionsByDriver: RecordsByDriver = {};

  for (const item of locations) {
    const driverNumber = Number(item.driver_number);
    locationsByDriver[driverNumber] ??= [];
    locationsByDriver[driverNumber].push(item as OpenF1TimedRecord);
  }

  for (const item of carData) {
    const driverNumber = Number(item.driver_number);
    telemetryByDriver[driverNumber] ??= [];
    telemetryByDriver[driverNumber].push(item as OpenF1TimedRecord);
  }

  for (const item of positions) {
    const driverNumber = Number(item.driver_number);
    positionsByDriver[driverNumber] ??= [];
    positionsByDriver[driverNumber].push(item as OpenF1TimedRecord);
  }

  for (const driverNumber of Object.keys(locationsByDriver)) {
    locationsByDriver[Number(driverNumber)].sort((a, b) => a.date.localeCompare(b.date));
  }
  for (const driverNumber of Object.keys(telemetryByDriver)) {
    telemetryByDriver[Number(driverNumber)].sort((a, b) => a.date.localeCompare(b.date));
  }
  for (const driverNumber of Object.keys(positionsByDriver)) {
    positionsByDriver[Number(driverNumber)].sort((a, b) => a.date.localeCompare(b.date));
  }

  const lapByDriver: Record<number, Array<Record<string, unknown>>> = {};
  for (const lap of laps) {
    const driverNumber = Number(lap.driver_number);
    lapByDriver[driverNumber] ??= [];
    lapByDriver[driverNumber].push(lap);
  }
  for (const driverNumber of Object.keys(lapByDriver).map(Number)) {
    lapByDriver[driverNumber].sort((a, b) => {
      const lapDelta = Number(a.lap_number) - Number(b.lap_number);
      if (lapDelta !== 0) {
        return lapDelta;
      }
      return String(a.date_start ?? "").localeCompare(String(b.date_start ?? ""));
    });
  }

  let totalLaps = 1;
  for (const lap of laps) {
    const lapNumber = Number(lap.lap_number);
    if (lapNumber > totalLaps) {
      totalLaps = lapNumber;
    }
  }

  function latestBefore<T extends { date: string }>(records: T[], isoTarget: string): T | null {
    let lower = 0;
    let upper = records.length - 1;
    let result: T | null = null;

    while (lower <= upper) {
      const middle = (lower + upper) >> 1;
      if (records[middle].date <= isoTarget) {
        result = records[middle];
        lower = middle + 1;
      } else {
        upper = middle - 1;
      }
    }

    return result;
  }

  function lapAt(driverNumber: number, isoTarget: string) {
    const driverLaps = lapByDriver[driverNumber] ?? [];
    let currentLap = 1;
    for (const lap of driverLaps) {
      if (String(lap.date_start) <= isoTarget) {
        currentLap = Number(lap.lap_number);
      } else {
        break;
      }
    }
    return currentLap;
  }

  function lapProgressAt(driverNumber: number, timestampMs: number) {
    const driverLaps = lapByDriver[driverNumber] ?? [];
    if (driverLaps.length === 0) {
      return 0;
    }

    let activeIndex = 0;
    for (let index = 0; index < driverLaps.length; index += 1) {
      const lapStart = new Date(String(driverLaps[index].date_start)).getTime();
      if (lapStart <= timestampMs) {
        activeIndex = index;
      } else {
        break;
      }
    }

    const lapStart = new Date(String(driverLaps[activeIndex].date_start)).getTime();
    const nextLapStart =
      activeIndex + 1 < driverLaps.length
        ? new Date(String(driverLaps[activeIndex + 1].date_start)).getTime()
        : lapStart + Math.max(Number(driverLaps[activeIndex].lap_duration) * 1000 || 90_000, 60_000);

    const duration = Math.max(1, nextLapStart - lapStart);
    return Math.max(0, Math.min(0.999, (timestampMs - lapStart) / duration));
  }

  const startingPositions: Record<number, number> = {};
  for (const driverNumber of Object.keys(drivers).map(Number)) {
    const firstPosition = positionsByDriver[driverNumber]?.[0];
    startingPositions[driverNumber] = Number(firstPosition?.position ?? 20);
  }

  const sampleIntervalMs = 1000;
  const fallbackEndTime =
    laps.length > 0
      ? Math.max(
          ...laps.map((lap) => {
            const lapStart = new Date(String(lap.date_start)).getTime();
            const lapDurationMs = Number(lap.lap_duration) * 1000 || 90_000;
            return lapStart + lapDurationMs;
          }),
        )
      : origin + 90_000;
  const rawTimestamps = Array.from(
    new Set(
      (
        hasLocationData
          ? locations
          : positions.length > 0
            ? positions
            : carData.length > 0
              ? carData
              : Array.from({ length: Math.max(1, Math.ceil((fallbackEndTime - origin) / sampleIntervalMs)) }, (_, index) => ({
                  date: new Date(origin + index * sampleIntervalMs).toISOString(),
                }))
      ).map((item) => Math.round((new Date(String(item.date)).getTime() - origin) / sampleIntervalMs) * sampleIntervalMs),
    ),
  ).sort((a, b) => a - b);

  const playbackStartOffset = rawTimestamps.find((timestamp) => timestamp >= 0) ?? rawTimestamps[0] ?? 0;
  const timestamps = rawTimestamps
    .filter((timestamp) => timestamp >= playbackStartOffset)
    .map((timestamp) => timestamp - playbackStartOffset);
  const frames: Record<number, Record<number, DriverSnapshot>> = {};

  for (const rawTimestamp of rawTimestamps) {
    if (rawTimestamp < playbackStartOffset) {
      continue;
    }

    const timestamp = rawTimestamp - playbackStartOffset;
    const isoTarget = new Date(origin + rawTimestamp).toISOString();
    const absoluteTimestamp = origin + rawTimestamp;
    frames[timestamp] = {};

    for (const driverNumber of Object.keys(drivers).map(Number)) {
      const telemetry = latestBefore(telemetryByDriver[driverNumber] ?? [], isoTarget);
      const position = latestBefore(positionsByDriver[driverNumber] ?? [], isoTarget);
      const lap = lapAt(driverNumber, isoTarget);

      let trackProgress = 0;
      if (hasLocationData && pointToTrackProgress) {
        const location = latestBefore(locationsByDriver[driverNumber] ?? [], isoTarget);
        if (location) {
          trackProgress = pointToTrackProgress(Number(location.x), Number(location.y));
        }
      } else {
        const positionValue = startingPositions[driverNumber] ?? 20;
        const stagger = ((20 - positionValue) / 20) * 0.035;
        trackProgress = (lapProgressAt(driverNumber, absoluteTimestamp) + stagger) % 1;
      }

      const fallbackPosition = Math.max(1, Math.min(20, driverNumber));
      const fallbackSpeed = 210 + ((driverNumber * 17) % 85);
      const fallbackGear = 6 + (driverNumber % 3);

      frames[timestamp][driverNumber] = {
        driverNumber,
        trackProgress,
        lap,
        position: Number(position?.position ?? fallbackPosition),
        speed: Number(telemetry?.speed ?? fallbackSpeed),
        gear: Number(telemetry?.gear ?? fallbackGear),
        drs: Number(telemetry?.drs ?? 0) >= 10,
      };
    }
  }

  if (!hasLocationData) {
    enforceSyntheticForwardMotion(timestamps, frames, Object.keys(drivers).map(Number), totalLaps);
  }

  if (debugEnabled) {
    const sampleDriver = Object.keys(drivers).map(Number).sort((a, b) => a - b)[0];
    if (sampleDriver !== undefined) {
      let previousLap: number | null = null;
      let previousProgress: number | null = null;
      const regressions: Array<{
        timestamp: number;
        previousLap: number | null;
        previousProgress: number | null;
        lap: number;
        progress: number;
      }> = [];

      for (const timestamp of timestamps) {
        const frame = frames[timestamp]?.[sampleDriver];
        if (!frame) {
          continue;
        }

        if (
          previousLap !== null &&
          previousProgress !== null &&
          frame.lap === previousLap &&
          frame.trackProgress + 0.0001 < previousProgress
        ) {
          regressions.push({
            timestamp,
            previousLap,
            previousProgress,
            lap: frame.lap,
            progress: frame.trackProgress,
          });
          if (regressions.length >= 5) {
            break;
          }
        }

        previousLap = frame.lap;
        previousProgress = frame.trackProgress;
      }

      console.debug("[live-race] fetchRaceField regression check", {
        sessionKey,
        hasLocationData,
        sampleDriver,
        regressions,
      });
    }
  }

  return {
    sessionKey,
    sessionName: String(session.session_name ?? session.session_type ?? "Race"),
    circuit: String(session.circuit_short_name ?? session.location ?? "Unknown"),
    totalLaps,
    drivers,
    timestamps,
    frames,
    trackPath,
  };
}
