/**
 * LiveTrackCanvas.tsx
 * ────────────────────
 * Canvas renderer for the live race.
 * Draws the track outline, 20 real driver dots, and the user's car
 * with visual cues (boost glow, spin effect, collision flash, etc.)
 */

import { useEffect, useRef } from "react";
import type { RaceField, DriverSnapshot } from "../utils/fetchRaceField";
import type { UserCarState, VisualCueType } from "../utils/racePositionEngine";
import { USER_COLOR, USER_DRIVER_NUMBER } from "../hooks/useLiveRace";

interface Props {
  field: RaceField;
  realFrames: Record<number, DriverSnapshot>;
  userCar: UserCarState;
  watchedDriver: number | null; // USER_DRIVER_NUMBER (0) or a real driver number
  onDriverClick?: (driverNumber: number) => void;
  width?: number;
  height?: number;
}

const PAD = 44;
const CAR_R = 5;
const USER_R = 7;
const TRACK_W = 10;

// Visual cue configs
const CUE_CONFIG: Record<VisualCueType, { color: string; glowRadius: number; label: string }> = {
  STRAIGHT_BOOST:  { color: "#00ff88", glowRadius: 16, label: "⚡ BOOST" },
  CORNER_TAKEN:    { color: "#00aaff", glowRadius: 12, label: "↻ CORNER" },
  SPIN_OUT:        { color: "#ff2200", glowRadius: 20, label: "🌀 SPIN" },
  TYRE_PUNCTURE:   { color: "#ff8800", glowRadius: 18, label: "! FLAT" },
  COLLISION:       { color: "#ff0044", glowRadius: 22, label: "💥 COLLISION" },
  FUEL_WASTE:      { color: "#888888", glowRadius: 10, label: "⛽ WASTE" },
  PIT_STOP_WASTED: { color: "#ffdd00", glowRadius: 12, label: "⬛ PIT WASTE" },
  OVER_ENGINEERED: { color: "#cc44ff", glowRadius: 14, label: "⚙ COMPLEX" },
  CLEAN_LAP:       { color: "#ffd700", glowRadius: 24, label: "★ PERFECT" },
  NONE:            { color: USER_COLOR, glowRadius: 8, label: "" },
};

export function LiveTrackCanvas({
  field,
  realFrames,
  userCar,
  onDriverClick,
  width = 900,
  height = 680,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Scale helpers
  const sx = (x: number) => PAD + x * (width - PAD * 2);
  const sy = (y: number) => PAD + y * (height - PAD * 2);

  // Compute user (x,y) from track progress
  function userXY(): { x: number; y: number } {
    const path = field.trackPath;
    if (!path.length) return { x: 0.5, y: 0.5 };
    const idx = Math.min(
      path.length - 1,
      Math.floor(userCar.trackProgress * path.length)
    );
    return path[idx];
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // ── Track outline ──────────────────────────────────────────────────────────
    const path = field.trackPath;
    if (path.length > 2) {
      // Outer shadow
      ctx.beginPath();
      ctx.moveTo(sx(path[0].x), sy(path[0].y));
      for (let i = 1; i < path.length; i++) {
        const prev = path[i - 1];
        const curr = path[i];
        const mx = (prev.x + curr.x) / 2;
        const my = (prev.y + curr.y) / 2;
        ctx.quadraticCurveTo(sx(prev.x), sy(prev.y), sx(mx), sy(my));
      }
      ctx.closePath();
      ctx.strokeStyle = "#444";
      ctx.lineWidth = TRACK_W + 6;
      ctx.stroke();

      // Track surface
      ctx.beginPath();
      ctx.moveTo(sx(path[0].x), sy(path[0].y));
      for (let i = 1; i < path.length; i++) {
        const prev = path[i - 1];
        const curr = path[i];
        const mx = (prev.x + curr.x) / 2;
        const my = (prev.y + curr.y) / 2;
        ctx.quadraticCurveTo(sx(prev.x), sy(prev.y), sx(mx), sy(my));
      }
      ctx.closePath();
      ctx.strokeStyle = "#2a2a2a";
      ctx.lineWidth = TRACK_W;
      ctx.stroke();

      // Track centre line (subtle)
      ctx.beginPath();
      ctx.moveTo(sx(path[0].x), sy(path[0].y));
      for (let i = 1; i < path.length; i++) {
        const prev = path[i - 1];
        const curr = path[i];
        const mx = (prev.x + curr.x) / 2;
        const my = (prev.y + curr.y) / 2;
        ctx.quadraticCurveTo(sx(prev.x), sy(prev.y), sx(mx), sy(my));
      }
      ctx.closePath();
      ctx.strokeStyle = "#3a3a3a";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 12]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Real driver dots ───────────────────────────────────────────────────────
    for (const frame of Object.values(realFrames)) {
      const pathIdx = Math.min(
        path.length - 1,
        Math.floor(frame.trackProgress * path.length)
      );
      const pt = path[pathIdx];
      if (!pt) continue;

      const cx = sx(pt.x);
      const cy = sy(pt.y);
      const driver = field.drivers[frame.driverNumber];
      const color = driver?.teamColor ?? "#ffffff";

      ctx.beginPath();
      ctx.arc(cx, cy, CAR_R, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#00000077";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ── User car ───────────────────────────────────────────────────────────────
    const uxy = userXY();
    const ux = sx(uxy.x);
    const uy = sy(uxy.y);

    const cue = userCar.visualCue;
    const cueConf = CUE_CONFIG[cue] ?? CUE_CONFIG.NONE;
    const cueProgress = userCar.cueTimeRemaining > 0
      ? userCar.cueTimeRemaining / 2000
      : 0;

    // Outer glow
    if (cueProgress > 0) {
      const glowR = cueConf.glowRadius * (0.5 + cueProgress * 0.5);
      const gradient = ctx.createRadialGradient(ux, uy, 0, ux, uy, glowR);
      gradient.addColorStop(0, cueConf.color + "cc");
      gradient.addColorStop(1, cueConf.color + "00");
      ctx.beginPath();
      ctx.arc(ux, uy, glowR, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    } else {
      // Always-on soft glow for user
      const gradient = ctx.createRadialGradient(ux, uy, 0, ux, uy, 12);
      gradient.addColorStop(0, USER_COLOR + "88");
      gradient.addColorStop(1, USER_COLOR + "00");
      ctx.beginPath();
      ctx.arc(ux, uy, 12, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // User dot
    ctx.beginPath();
    ctx.arc(ux, uy, USER_R, 0, Math.PI * 2);
    ctx.fillStyle = cueProgress > 0 ? cueConf.color : USER_COLOR;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Penalty pulse ring
    if (userCar.isPenalty && cueProgress > 0) {
      const ringR = USER_R + 6 + (1 - cueProgress) * 10;
      ctx.beginPath();
      ctx.arc(ux, uy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = cueConf.color + Math.round(cueProgress * 255).toString(16).padStart(2, "0");
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Active cue label (small text above car)
    if (cueConf.label && cueProgress > 0.3) {
      ctx.font = "bold 10px 'Titillium Web', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = cueConf.color;
      ctx.fillText(cueConf.label, ux, uy - USER_R - 6);
    }

  }, [field, realFrames, userCar, width, height]);

  // Click detection
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onDriverClick) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (width / rect.width);
    const my = (e.clientY - rect.top) * (height / rect.height);

    // Check user car first
    const uxy = userXY();
    if (Math.hypot(mx - sx(uxy.x), my - sy(uxy.y)) < 16) {
      onDriverClick(USER_DRIVER_NUMBER);
      return;
    }

    // Check real drivers
    let closest: number | null = null;
    let minDist = 16;
    for (const frame of Object.values(realFrames)) {
      const pathIdx = Math.min(
        field.trackPath.length - 1,
        Math.floor(frame.trackProgress * field.trackPath.length)
      );
      const pt = field.trackPath[pathIdx];
      if (!pt) continue;
      const dist = Math.hypot(mx - sx(pt.x), my - sy(pt.y));
      if (dist < minDist) { minDist = dist; closest = frame.driverNumber; }
    }
    if (closest !== null) onDriverClick(closest);
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onClick={handleClick}
      style={{ display: "block", cursor: onDriverClick ? "pointer" : "default" }}
    />
  );
}
