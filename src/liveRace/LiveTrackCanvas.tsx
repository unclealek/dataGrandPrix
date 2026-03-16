import { useEffect, useRef } from "react";
import type { DriverSnapshot, RaceField } from "./fetchRaceField";
import type { UserCarState, VisualCueType } from "./racePositionEngine";
import { USER_COLOR, USER_DRIVER_NUMBER } from "./useLiveRace";

interface Props {
  field: RaceField;
  realFrames: Record<number, DriverSnapshot>;
  userCar: UserCarState;
  selectedDriverNumber?: number | null;
  onDriverHover?: (driverNumber: number | null) => void;
  onDriverSelect?: (driverNumber: number | null) => void;
  width?: number;
  height?: number;
}

const PAD = 44;
const CAR_RADIUS = 5;
const USER_RADIUS = 7;
const TRACK_WIDTH = 10;

// Anti-overlap: cars within this fraction of the track (on a circular basis)
// are considered "stacked" and get spread perpendicular to the track direction.
// 0.012 ≈ ~60m on a 5km circuit, enough to catch grid-start clusters.
const STACK_BIN_SIZE = 0.012;

// How far to offset each car in a stack, in canvas pixels
const STACK_OFFSET_PX = 10;

const cueConfig: Record<VisualCueType, { color: string; glowRadius: number; label: string }> = {
  STRAIGHT_BOOST: { color: "#00ff88", glowRadius: 16, label: "BOOST" },
  CORNER_TAKEN: { color: "#00aaff", glowRadius: 12, label: "CORNER" },
  SPIN_OUT: { color: "#ff2200", glowRadius: 20, label: "SPIN" },
  TYRE_PUNCTURE: { color: "#ff8800", glowRadius: 18, label: "FLAT" },
  COLLISION: { color: "#ff0044", glowRadius: 22, label: "COLLISION" },
  FUEL_WASTE: { color: "#888888", glowRadius: 10, label: "WASTE" },
  PIT_STOP_WASTED: { color: "#ffdd00", glowRadius: 12, label: "PIT WASTE" },
  OVER_ENGINEERED: { color: "#cc44ff", glowRadius: 14, label: "COMPLEX" },
  CLEAN_LAP: { color: "#ffd700", glowRadius: 24, label: "PERFECT" },
  NONE: { color: USER_COLOR, glowRadius: 8, label: "" },
};

// ─── Circular distance ────────────────────────────────────────────────────────
// Returns the shortest arc distance between two progress values on a unit circle.
// This correctly treats 0.99 and 0.01 as 0.02 apart, not 0.98 apart.
function circularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 1 - diff);
}

// ─── Perpendicular offset for stacked cars ────────────────────────────────────
// Given a track path and a progress value, compute a unit vector perpendicular
// to the track direction at that point. Used to spread overlapping cars sideways.
function perpendicularAt(
  path: { x: number; y: number }[],
  progress: number,
  drawWidth: number,
  drawHeight: number,
): { nx: number; ny: number } {
  if (path.length < 2) return { nx: 0, ny: 1 };

  const idx = Math.min(path.length - 1, Math.floor(progress * path.length));
  const prev = path[Math.max(0, idx - 1)];
  const next = path[Math.min(path.length - 1, idx + 1)];

  // Direction along track (in canvas coordinates)
  const dx = (next.x - prev.x) * drawWidth;
  const dy = (next.y - prev.y) * drawHeight;
  const len = Math.hypot(dx, dy) || 1;

  // Perpendicular: rotate 90°
  return { nx: -dy / len, ny: dx / len };
}

// ─── Group cars into stacks using circular distance ───────────────────────────
// Returns a map from driverNumber → { offsetIndex, stackSize }
// offsetIndex is the car's position within its stack (0, 1, 2…)
// so each car can be spread by offsetIndex * STACK_OFFSET_PX perpendicular to track.
interface StackInfo {
  offsetIndex: number;
  stackSize: number;
}

function buildStackMap(
  entries: Array<{ driverNumber: number; trackProgress: number }>,
): Map<number, StackInfo> {
  const result = new Map<number, StackInfo>();
  const assigned = new Set<number>();

  for (let i = 0; i < entries.length; i++) {
    if (assigned.has(entries[i].driverNumber)) continue;

    // Find all cars within STACK_BIN_SIZE circular distance of this one
    const stack: number[] = [entries[i].driverNumber];
    assigned.add(entries[i].driverNumber);

    for (let j = i + 1; j < entries.length; j++) {
      if (assigned.has(entries[j].driverNumber)) continue;
      if (circularDistance(entries[i].trackProgress, entries[j].trackProgress) < STACK_BIN_SIZE) {
        stack.push(entries[j].driverNumber);
        assigned.add(entries[j].driverNumber);
      }
    }

    // Assign offset indices centred on 0:
    // stack of 1 → [0], stack of 2 → [-0.5, 0.5], stack of 3 → [-1, 0, 1] etc.
    const centre = (stack.length - 1) / 2;
    for (let k = 0; k < stack.length; k++) {
      result.set(stack[k], { offsetIndex: k - centre, stackSize: stack.length });
    }
  }

  return result;
}

export function LiveTrackCanvas({
  field,
  realFrames,
  userCar,
  selectedDriverNumber,
  onDriverHover,
  onDriverSelect,
  width = 900,
  height = 620,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawW = width - PAD * 2;
  const drawH = height - PAD * 2;
  const scaleX = (x: number) => PAD + x * drawW;
  const scaleY = (y: number) => PAD + y * drawH;

  function getPointAtProgress(progress: number) {
    const path = field.trackPath;
    if (path.length === 0) return { x: 0.5, y: 0.5 };
    const index = Math.min(path.length - 1, Math.floor(progress * path.length));
    return path[index];
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, width, height);

    const path = field.trackPath;

    // ── Track outline ──────────────────────────────────────────────────────────
    if (path.length > 2) {
      for (const [strokeStyle, lineWidth, dash] of [
        ["#444", TRACK_WIDTH + 6, [] as number[]],
        ["#1f252f", TRACK_WIDTH, [] as number[]],
        ["#464d58", 2, [8, 10]],
      ] as Array<[string, number, number[]]>) {
        context.beginPath();
        context.moveTo(scaleX(path[0].x), scaleY(path[0].y));
        for (let i = 1; i < path.length; i++) {
          const prev = path[i - 1];
          const curr = path[i];
          const mx = (prev.x + curr.x) / 2;
          const my = (prev.y + curr.y) / 2;
          context.quadraticCurveTo(scaleX(prev.x), scaleY(prev.y), scaleX(mx), scaleY(my));
        }
        context.closePath();
        context.strokeStyle = strokeStyle;
        context.lineWidth = lineWidth;
        context.setLineDash(dash);
        context.stroke();
      }
      context.setLineDash([]);
    }

    // ── Build stack map for all cars including user ───────────────────────────
    // We include the user car in stack detection so it also gets spread
    // if it overlaps with real drivers (e.g. at race start).
    const allEntries: Array<{ driverNumber: number; trackProgress: number }> = [
      { driverNumber: USER_DRIVER_NUMBER, trackProgress: userCar.trackProgress },
      ...Object.values(realFrames).map((f) => ({
        driverNumber: f.driverNumber,
        trackProgress: f.trackProgress,
      })),
    ];
    const stackMap = buildStackMap(allEntries);

    // ── Draw real driver dots ─────────────────────────────────────────────────
    for (const frame of Object.values(realFrames)) {
      const point = getPointAtProgress(frame.trackProgress);
      const driver = field.drivers[frame.driverNumber];
      const isSelected = selectedDriverNumber === frame.driverNumber;

      // Apply perpendicular offset if in a stack
      const stackInfo = stackMap.get(frame.driverNumber);
      let cx = scaleX(point.x);
      let cy = scaleY(point.y);
      if (stackInfo && stackInfo.stackSize > 1) {
        const perp = perpendicularAt(path, frame.trackProgress, drawW, drawH);
        const offset = stackInfo.offsetIndex * STACK_OFFSET_PX;
        cx += perp.nx * offset;
        cy += perp.ny * offset;
      }

      context.beginPath();
      context.arc(cx, cy, isSelected ? CAR_RADIUS + 2 : CAR_RADIUS, 0, Math.PI * 2);
      context.fillStyle = driver?.teamColor ?? "#ffffff";
      context.fill();
      context.strokeStyle = isSelected ? "#ffffff" : "#00000077";
      context.lineWidth = isSelected ? 2 : 1;
      context.stroke();
    }

    // ── Draw user car ─────────────────────────────────────────────────────────
    const userPoint = getPointAtProgress(userCar.trackProgress);
    let userX = scaleX(userPoint.x);
    let userY = scaleY(userPoint.y);

    const userStackInfo = stackMap.get(USER_DRIVER_NUMBER);
    if (userStackInfo && userStackInfo.stackSize > 1) {
      const perp = perpendicularAt(path, userCar.trackProgress, drawW, drawH);
      const offset = userStackInfo.offsetIndex * STACK_OFFSET_PX;
      userX += perp.nx * offset;
      userY += perp.ny * offset;
    }

    const cue = cueConfig[userCar.visualCue] ?? cueConfig.NONE;
    const cueProgress = userCar.cueTimeRemaining > 0 ? userCar.cueTimeRemaining / 2000 : 0;

    const glowR = cueProgress > 0 ? cue.glowRadius : 12;
    const glow = context.createRadialGradient(userX, userY, 0, userX, userY, glowR);
    glow.addColorStop(0, `${cue.color}${cueProgress > 0 ? "cc" : "88"}`);
    glow.addColorStop(1, `${cue.color}00`);
    context.beginPath();
    context.arc(userX, userY, glowR, 0, Math.PI * 2);
    context.fillStyle = glow;
    context.fill();

    context.beginPath();
    context.arc(userX, userY, USER_RADIUS, 0, Math.PI * 2);
    context.fillStyle = cueProgress > 0 ? cue.color : USER_COLOR;
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 2;
    context.stroke();

    if (userCar.isPenalty && cueProgress > 0) {
      const ringRadius = USER_RADIUS + 6 + (1 - cueProgress) * 10;
      context.beginPath();
      context.arc(userX, userY, ringRadius, 0, Math.PI * 2);
      context.strokeStyle = `${cue.color}${Math.round(cueProgress * 255).toString(16).padStart(2, "0")}`;
      context.lineWidth = 2;
      context.stroke();
    }

    if (cue.label && cueProgress > 0.3) {
      context.font = "bold 11px 'Barlow Condensed', monospace";
      context.textAlign = "center";
      context.fillStyle = cue.color;
      context.fillText(cue.label, userX, userY - USER_RADIUS - 8);
    }
  }, [field, realFrames, selectedDriverNumber, userCar, width, height, drawW, drawH]);

  // ── Hit testing ───────────────────────────────────────────────────────────
  // Must mirror the same stack offsets applied during drawing so clicks
  // register on where cars are visually rendered, not their raw track position.
  function resolveClosestDriver(clientX: number, clientY: number): number | null {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const mouseX = (clientX - rect.left) * (width / rect.width);
    const mouseY = (clientY - rect.top) * (height / rect.height);

    const allEntries: Array<{ driverNumber: number; trackProgress: number }> = [
      { driverNumber: USER_DRIVER_NUMBER, trackProgress: userCar.trackProgress },
      ...Object.values(realFrames).map((f) => ({
        driverNumber: f.driverNumber,
        trackProgress: f.trackProgress,
      })),
    ];
    const stackMap = buildStackMap(allEntries);
    const path = field.trackPath;

    let closest: number | null = null;
    let minDistance = 14;

    // Check user car
    const userPoint = getPointAtProgress(userCar.trackProgress);
    let ux = scaleX(userPoint.x);
    let uy = scaleY(userPoint.y);
    const userStack = stackMap.get(USER_DRIVER_NUMBER);
    if (userStack && userStack.stackSize > 1) {
      const perp = perpendicularAt(path, userCar.trackProgress, drawW, drawH);
      ux += perp.nx * userStack.offsetIndex * STACK_OFFSET_PX;
      uy += perp.ny * userStack.offsetIndex * STACK_OFFSET_PX;
    }
    const userDist = Math.hypot(mouseX - ux, mouseY - uy);
    if (userDist < minDistance) {
      minDistance = userDist;
      closest = USER_DRIVER_NUMBER;
    }

    // Check real drivers
    for (const frame of Object.values(realFrames)) {
      const point = getPointAtProgress(frame.trackProgress);
      let cx = scaleX(point.x);
      let cy = scaleY(point.y);
      const stackInfo = stackMap.get(frame.driverNumber);
      if (stackInfo && stackInfo.stackSize > 1) {
        const perp = perpendicularAt(path, frame.trackProgress, drawW, drawH);
        cx += perp.nx * stackInfo.offsetIndex * STACK_OFFSET_PX;
        cy += perp.ny * stackInfo.offsetIndex * STACK_OFFSET_PX;
      }
      const dist = Math.hypot(mouseX - cx, mouseY - cy);
      if (dist < minDistance) {
        minDistance = dist;
        closest = frame.driverNumber;
      }
    }

    return closest;
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="live-track-canvas"
      onMouseMove={(event) => onDriverHover?.(resolveClosestDriver(event.clientX, event.clientY))}
      onMouseLeave={() => onDriverHover?.(null)}
      onClick={(event) => onDriverSelect?.(resolveClosestDriver(event.clientX, event.clientY))}
    />
  );
}
