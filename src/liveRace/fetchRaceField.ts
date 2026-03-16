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

// ─── Dead reckoning constants ─────────────────────────────────────────────────

// Average F1 race lap ~90s. At 1x replay we advance 1/90000 of the track per ms.
// Each driver gets a slight spread based on their race position so they don't overlap.
const BASE_PROGRESS_PER_MS = 1 / 90_000;

// How much weight to give the real GPS frame vs the dead-reckoned position.
// 0 = pure dead reckoning, 1 = snap to GPS.
// 0.35 gives smooth motion that still follows real GPS when available.
const GPS_BLEND_WEIGHT = 0.35;

// Grid stagger: P1 starts ~0.035 ahead of P20 (spread across ~8m gaps on a 5km track)
const GRID_STAGGER_RANGE = 0.035;

// ─── Apply dead reckoning to a driver's frame sequence ───────────────────────
//
// Problem: OpenF1 GPS location is sparse (~3.7Hz) and the nearest-point lookup
// often returns the same trackProgress for multiple consecutive timestamps,
// making drivers look frozen even when time is advancing.
//
// Fix: maintain a "reckoned" position that always advances forward based on speed.
// When a real GPS fix arrives, nudge toward it rather than snapping.
//
function applyDeadReckoning(
  driverNumber: number,
  timestamps: number[],
  rawFrames: Record<number, Record<number, DriverSnapshot>>,
  startingProgress: number,
  totalLaps: number,
): void {
  let reckonedProgress = startingProgress;
  let reckonedLap = 1;
  let lastGpsProgress = startingProgress;
  let lastGpsTimestamp = -1;

  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const frame = rawFrames[ts]?.[driverNumber];
    if (!frame) continue;

    const elapsedMs = i > 0 ? ts - timestamps[i - 1] : 0;

    // Advance reckoned position based on driver's current speed
    // Use their actual speed if available, fall back to a position-based estimate
    const speedKmh = frame.speed > 0 ? frame.speed : 200 + ((driverNumber * 13) % 60);
    // Convert km/h to track-fraction-per-ms:
    // speedKmh / 3600 = km/s, typical F1 circuit ~5km, so fraction/s = speed/3600/5
    // Simplified: we use BASE_PROGRESS_PER_MS scaled by speed/250 (250 = typical race speed)
    const speedMultiplier = speedKmh / 250;
    const progressDelta = BASE_PROGRESS_PER_MS * speedMultiplier * elapsedMs;

    reckonedProgress += progressDelta;

    // Lap rollover
    if (reckonedProgress >= 1) {
      reckonedProgress -= 1;
      reckonedLap = Math.min(totalLaps, reckonedLap + 1);
    }

    // GPS fix available: blend toward it
    const rawGpsProgress = frame.trackProgress;
    const gpsChanged = Math.abs(rawGpsProgress - lastGpsProgress) > 0.001 || lastGpsTimestamp === -1;

    if (gpsChanged) {
      // Real GPS data arrived — nudge reckoned position toward it
      // Handle track wrap-around (e.g. reckoned=0.98, gps=0.02 is a small forward delta)
      let gpsDelta = rawGpsProgress - reckonedProgress;
      if (gpsDelta < -0.5) gpsDelta += 1;
      if (gpsDelta > 0.5) gpsDelta -= 1;

      // Only blend forward — never pull the car backwards from a GPS glitch
      if (gpsDelta > -0.05) {
        reckonedProgress += gpsDelta * GPS_BLEND_WEIGHT;
        if (reckonedProgress >= 1) { reckonedProgress -= 1; reckonedLap = Math.min(totalLaps, reckonedLap + 1); }
        if (reckonedProgress < 0) reckonedProgress += 1;
      }

      lastGpsProgress = rawGpsProgress;
      lastGpsTimestamp = ts;
    }

    // Write the smoothed progress back into the frame
    rawFrames[ts][driverNumber] = {
      ...frame,
      trackProgress: reckonedProgress,
      lap: Math.max(frame.lap, reckonedLap),
    };
  }
}

// ─── Compute grid starting offsets based on qualifying/race start order ───────
//
// Drivers starting P1 are slightly ahead on track, P20 slightly behind.
// This prevents all cars overlapping at trackProgress=0 at race start.
//
function gridStartProgress(raceStartPosition: number): number {
  // P1 gets the largest offset (front of grid), P20 gets smallest
  const normalised = (20 - raceStartPosition) / 19; // 0 for P20, 1 for P1
  return normalised * GRID_STAGGER_RANGE;
}

export async function fetchRaceField(
  sessionKey: number,
  onProgress?: (message: string) => void,
): Promise<RaceField> {
  const log = onProgress ?? (() => undefined);

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
  const driverOrder: number[] = [];
  for (const driver of driverData) {
    const number = Number(driver.driver_number);
    driverOrder.push(number);
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

  type OpenF1TimedRecord = { date: string; [key: string]: unknown };
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

  // ── Determine race start positions from first available position data ────────
  // Used to stagger grid starting offsets so cars don't all overlap at t=0.
  const startingPositions: Record<number, number> = {};
  const fallbackGridOrder = driverOrder.length > 0 ? driverOrder : Object.keys(drivers).map(Number).sort((a, b) => a - b);
  for (const [index, driverNumber] of fallbackGridOrder.entries()) {
    const firstPos = positionsByDriver[driverNumber]?.[0];
    startingPositions[driverNumber] = firstPos ? Number(firstPos.position) : index + 1;
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

  const timestamps = Array.from(
    new Set(
      (
        hasLocationData
          ? locations
          : positions.length > 0
            ? positions
            : carData.length > 0
              ? carData
              : Array.from(
                  { length: Math.max(1, Math.ceil((fallbackEndTime - origin) / sampleIntervalMs)) },
                  (_, index) => ({ date: new Date(origin + index * sampleIntervalMs).toISOString() }),
                )
      ).map(
        (item) =>
          Math.round((new Date(String(item.date)).getTime() - origin) / sampleIntervalMs) * sampleIntervalMs,
      ),
    ),
  ).sort((a, b) => a - b);

  // ── Build raw frames (same as before) ────────────────────────────────────────
  const frames: Record<number, Record<number, DriverSnapshot>> = {};

  for (const timestamp of timestamps) {
    const isoTarget = new Date(origin + timestamp).toISOString();
    const absoluteTimestamp = origin + timestamp;
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
        const positionValue = Number(position?.position ?? startingPositions[driverNumber] ?? 20);
        const stagger = ((20 - positionValue) / 19) * GRID_STAGGER_RANGE;
        trackProgress = (lapProgressAt(driverNumber, absoluteTimestamp) + stagger) % 1;
      }

      const fallbackPosition = Math.max(1, Math.min(20, startingPositions[driverNumber] ?? fallbackGridOrder.indexOf(driverNumber) + 1));
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

  // ── Apply dead reckoning pass over every driver ───────────────────────────
  // This is the key fix: after building raw frames, we walk each driver's
  // timeline and ensure their trackProgress always advances monotonically.
  // Sparse or repeated GPS values no longer cause frozen cars.
  log("Smoothing opponent motion...");
  for (const driverNumber of Object.keys(drivers).map(Number)) {
    const startPos = startingPositions[driverNumber] ?? 20;
    const startProgress = gridStartProgress(startPos);
    applyDeadReckoning(driverNumber, timestamps, frames, startProgress, totalLaps);
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
