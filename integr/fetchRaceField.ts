/**
 * fetchRaceField.ts
 * ─────────────────
 * Fetches the 20 real F1 drivers' position data from OpenF1.
 * This gives us the "field" the user is racing against.
 *
 * We load a full race session and compress it into:
 *   - A normalised track path (SVG points)
 *   - Per-driver track progress at each timestamp
 *   - Driver colours & names for the leaderboard
 *
 * The data is fetched ONCE on page load and held in memory.
 * The user's car is then inserted as a 21st car driven by the scoring engine.
 */

export interface F1Driver {
  number: number;
  acronym: string;
  fullName: string;
  teamColor: string; // '#RRGGBB'
}

export interface DriverSnapshot {
  driverNumber: number;
  /** 0.0–1.0 fractional progress along normalised track */
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
  /** Sorted ms-since-session-start timestamps */
  timestamps: number[];
  /** frames[timestamp][driverNumber] = DriverSnapshot */
  frames: Record<number, Record<number, DriverSnapshot>>;
  /** Normalised track outline points for rendering */
  trackPath: { x: number; y: number }[];
}

// ─── Recent sessions list ────────────────────────────────────────────────────

export interface SessionSummary {
  sessionKey: number;
  label: string;       // "2024 — Bahrain GP"
  circuit: string;
  date: string;
}

export async function listRaceSessions(year = 2024): Promise<SessionSummary[]> {
  const url = `https://api.openf1.org/v1/sessions?year=${year}&session_type=Race`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenF1 sessions failed: ${res.status}`);
  const data = await res.json();
  return (data as any[])
    .sort((a, b) => b.date_start.localeCompare(a.date_start))
    .map((s) => ({
      sessionKey: s.session_key,
      label: `${s.year} — ${s.location} GP`,
      circuit: s.circuit_short_name ?? s.location,
      date: s.date_start,
    }));
}

// ─── Main loader ─────────────────────────────────────────────────────────────

export async function fetchRaceField(
  sessionKey: number,
  onProgress?: (msg: string) => void
): Promise<RaceField> {
  const log = onProgress ?? console.log;

  log("Loading session info…");
  const [sessionRes, driverRes] = await Promise.all([
    fetch(`https://api.openf1.org/v1/sessions?session_key=${sessionKey}`),
    fetch(`https://api.openf1.org/v1/drivers?session_key=${sessionKey}`),
  ]);

  const sessions = await sessionRes.json() as any[];
  const driverData = await driverRes.json() as any[];
  const session = sessions[0];
  const origin = new Date(session.date_start).getTime();

  log("Loading car positions…");
  const locationRes = await fetch(
    `https://api.openf1.org/v1/location?session_key=${sessionKey}`
  );
  const locations = await locationRes.json() as any[];

  log("Loading car telemetry…");
  const carRes = await fetch(
    `https://api.openf1.org/v1/car_data?session_key=${sessionKey}`
  );
  const carData = await carRes.json() as any[];

  log("Loading race positions…");
  const posRes = await fetch(
    `https://api.openf1.org/v1/position?session_key=${sessionKey}`
  );
  const positions = await posRes.json() as any[];

  log("Loading lap data…");
  const lapRes = await fetch(
    `https://api.openf1.org/v1/laps?session_key=${sessionKey}`
  );
  const laps = await lapRes.json() as any[];

  log("Processing data…");

  // ── Build driver map ────────────────────────────────────────────────────────
  const drivers: Record<number, F1Driver> = {};
  for (const d of driverData) {
    drivers[d.driver_number] = {
      number: d.driver_number,
      acronym: d.name_acronym ?? `D${d.driver_number}`,
      fullName: d.full_name ?? `Driver ${d.driver_number}`,
      teamColor: d.team_colour ? `#${d.team_colour}` : "#ffffff",
    };
  }

  // ── Normalise coordinates globally ─────────────────────────────────────────
  const allX = locations.map((l: any) => l.x as number);
  const allY = locations.map((l: any) => l.y as number);
  const minX = Math.min(...allX), maxX = Math.max(...allX);
  const minY = Math.min(...allY), maxY = Math.max(...allY);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const nx = (x: number) => (x - minX) / rangeX;
  const ny = (y: number) => (y - minY) / rangeY;

  // ── Build track path from location cloud ───────────────────────────────────
  // Use all unique (x,y) points, angle-sort around centroid, thin to 300 points
  const uniquePoints = Array.from(
    new Map(locations.map((l: any) => [`${Math.round(l.x/10)},${Math.round(l.y/10)}`, { x: nx(l.x), y: ny(l.y) }])).values()
  );
  const cx = uniquePoints.reduce((s, p) => s + p.x, 0) / uniquePoints.length;
  const cy = uniquePoints.reduce((s, p) => s + p.y, 0) / uniquePoints.length;
  const sorted = [...uniquePoints].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );
  const step = Math.max(1, Math.floor(sorted.length / 300));
  const trackPath = sorted.filter((_, i) => i % step === 0);

  // ── Build cumulative track distance lookup ─────────────────────────────────
  // For each (x,y) point, compute its 0–1 fractional position along the track
  // by projecting onto the nearest track segment.
  function pointToTrackProgress(px: number, py: number): number {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < trackPath.length; i++) {
      const d = Math.hypot(px - trackPath[i].x, py - trackPath[i].y);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best / trackPath.length;
  }

  // ── Sort and index all data by driver ──────────────────────────────────────
  type ByDriver<T> = Record<number, T[]>;
  const locByDriver: ByDriver<any> = {};
  const carByDriver: ByDriver<any> = {};
  const posByDriver: ByDriver<any> = {};

  for (const item of locations) {
    const dn = item.driver_number;
    if (!locByDriver[dn]) locByDriver[dn] = [];
    locByDriver[dn].push(item);
  }
  for (const item of carData) {
    const dn = item.driver_number;
    if (!carByDriver[dn]) carByDriver[dn] = [];
    carByDriver[dn].push(item);
  }
  for (const item of positions) {
    const dn = item.driver_number;
    if (!posByDriver[dn]) posByDriver[dn] = [];
    posByDriver[dn].push(item);
  }
  for (const key of Object.keys(locByDriver)) {
    locByDriver[+key].sort((a: any, b: any) => a.date.localeCompare(b.date));
  }
  for (const key of Object.keys(carByDriver)) {
    carByDriver[+key].sort((a: any, b: any) => a.date.localeCompare(b.date));
  }
  for (const key of Object.keys(posByDriver)) {
    posByDriver[+key].sort((a: any, b: any) => a.date.localeCompare(b.date));
  }

  // Lap data: driverNumber → sorted laps
  const lapByDriver: Record<number, any[]> = {};
  for (const lap of laps) {
    if (!lapByDriver[lap.driver_number]) lapByDriver[lap.driver_number] = [];
    lapByDriver[lap.driver_number].push(lap);
  }

  // Total laps
  const totalLaps = Math.max(...laps.map((l: any) => l.lap_number as number), 1);

  // ── Binary search helper ────────────────────────────────────────────────────
  function latestBefore<T extends { date: string }>(arr: T[], isoTarget: string): T | null {
    let lo = 0, hi = arr.length - 1, result: T | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].date <= isoTarget) { result = arr[mid]; lo = mid + 1; }
      else hi = mid - 1;
    }
    return result;
  }

  function getLapAt(driverNumber: number, isoTarget: string): number {
    const dLaps = lapByDriver[driverNumber] ?? [];
    let lap = 1;
    for (const l of dLaps) {
      if (l.date_start <= isoTarget) lap = l.lap_number;
      else break;
    }
    return lap;
  }

  // ── Build frame index ───────────────────────────────────────────────────────
  // Sample at ~1Hz (every 1000ms) to keep memory manageable for a full race
  const SAMPLE_INTERVAL = 1000;
  const allTimestamps = Array.from(
    new Set(
      locations.map((l: any) =>
        Math.round((new Date(l.date).getTime() - origin) / SAMPLE_INTERVAL) * SAMPLE_INTERVAL
      )
    )
  ).sort((a, b) => a - b);

  const frames: Record<number, Record<number, DriverSnapshot>> = {};

  for (const ts of allTimestamps) {
    const isoTarget = new Date(origin + ts).toISOString();
    frames[ts] = {};

    for (const dnStr of Object.keys(locByDriver)) {
      const dn = Number(dnStr);
      const loc = latestBefore(locByDriver[dn], isoTarget);
      if (!loc) continue;

      const car = latestBefore(carByDriver[dn] ?? [], isoTarget);
      const pos = latestBefore(posByDriver[dn] ?? [], isoTarget);
      const lap = getLapAt(dn, isoTarget);

      frames[ts][dn] = {
        driverNumber: dn,
        trackProgress: pointToTrackProgress(nx(loc.x), ny(loc.y)),
        lap,
        position: pos?.position ?? 99,
        speed: car?.speed ?? 0,
        gear: car?.gear ?? 0,
        drs: (car?.drs ?? 0) >= 10,
      };
    }
  }

  log("Race field ready ✓");

  return {
    sessionKey,
    sessionName: session.session_name ?? "Race",
    circuit: session.circuit_short_name ?? session.location,
    totalLaps,
    drivers,
    timestamps: allTimestamps,
    frames,
    trackPath,
  };
}
