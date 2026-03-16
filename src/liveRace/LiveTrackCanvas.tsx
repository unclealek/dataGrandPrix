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
  const scaleX = (x: number) => PAD + x * (width - PAD * 2);
  const scaleY = (y: number) => PAD + y * (height - PAD * 2);

  function getPointAtProgress(progress: number) {
    const path = field.trackPath;
    if (path.length === 0) {
      return { x: 0.5, y: 0.5 };
    }
    const index = Math.min(path.length - 1, Math.floor(progress * path.length));
    return path[index];
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, width, height);

    const path = field.trackPath;
    if (path.length > 2) {
      context.beginPath();
      context.moveTo(scaleX(path[0].x), scaleY(path[0].y));
      for (let index = 1; index < path.length; index += 1) {
        const previous = path[index - 1];
        const current = path[index];
        const midpointX = (previous.x + current.x) / 2;
        const midpointY = (previous.y + current.y) / 2;
        context.quadraticCurveTo(scaleX(previous.x), scaleY(previous.y), scaleX(midpointX), scaleY(midpointY));
      }
      context.closePath();
      context.strokeStyle = "#444";
      context.lineWidth = TRACK_WIDTH + 6;
      context.stroke();

      context.beginPath();
      context.moveTo(scaleX(path[0].x), scaleY(path[0].y));
      for (let index = 1; index < path.length; index += 1) {
        const previous = path[index - 1];
        const current = path[index];
        const midpointX = (previous.x + current.x) / 2;
        const midpointY = (previous.y + current.y) / 2;
        context.quadraticCurveTo(scaleX(previous.x), scaleY(previous.y), scaleX(midpointX), scaleY(midpointY));
      }
      context.closePath();
      context.strokeStyle = "#1f252f";
      context.lineWidth = TRACK_WIDTH;
      context.stroke();

      context.beginPath();
      context.moveTo(scaleX(path[0].x), scaleY(path[0].y));
      for (let index = 1; index < path.length; index += 1) {
        const previous = path[index - 1];
        const current = path[index];
        const midpointX = (previous.x + current.x) / 2;
        const midpointY = (previous.y + current.y) / 2;
        context.quadraticCurveTo(scaleX(previous.x), scaleY(previous.y), scaleX(midpointX), scaleY(midpointY));
      }
      context.closePath();
      context.strokeStyle = "#464d58";
      context.lineWidth = 2;
      context.setLineDash([8, 10]);
      context.stroke();
      context.setLineDash([]);
    }

    for (const frame of Object.values(realFrames)) {
      const point = getPointAtProgress(frame.trackProgress);
      const driver = field.drivers[frame.driverNumber];
      const isSelected = selectedDriverNumber === frame.driverNumber;
      context.beginPath();
      context.arc(scaleX(point.x), scaleY(point.y), isSelected ? CAR_RADIUS + 2 : CAR_RADIUS, 0, Math.PI * 2);
      context.fillStyle = driver?.teamColor ?? "#ffffff";
      context.fill();
      context.strokeStyle = isSelected ? "#ffffff" : "#00000077";
      context.lineWidth = isSelected ? 2 : 1;
      context.stroke();
    }

    const userPoint = getPointAtProgress(userCar.trackProgress);
    const userX = scaleX(userPoint.x);
    const userY = scaleY(userPoint.y);
    const cue = cueConfig[userCar.visualCue] ?? cueConfig.NONE;
    const cueProgress = userCar.cueTimeRemaining > 0 ? userCar.cueTimeRemaining / 2000 : 0;

    const glow = context.createRadialGradient(userX, userY, 0, userX, userY, cueProgress > 0 ? cue.glowRadius : 12);
    glow.addColorStop(0, `${cue.color}${cueProgress > 0 ? "cc" : "88"}`);
    glow.addColorStop(1, `${cue.color}00`);
    context.beginPath();
    context.arc(userX, userY, cueProgress > 0 ? cue.glowRadius : 12, 0, Math.PI * 2);
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
  }, [field, realFrames, selectedDriverNumber, userCar, width, height]);

  function resolveClosestDriver(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {
      return null;
    }

    const mouseX = (clientX - rect.left) * (width / rect.width);
    const mouseY = (clientY - rect.top) * (height / rect.height);
    const userPoint = getPointAtProgress(userCar.trackProgress);
    if (Math.hypot(mouseX - scaleX(userPoint.x), mouseY - scaleY(userPoint.y)) < 14) {
      return USER_DRIVER_NUMBER;
    }

    let closest: number | null = null;
    let minDistance = 14;
    for (const frame of Object.values(realFrames)) {
      const point = getPointAtProgress(frame.trackProgress);
      const distance = Math.hypot(mouseX - scaleX(point.x), mouseY - scaleY(point.y));
      if (distance < minDistance) {
        minDistance = distance;
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
