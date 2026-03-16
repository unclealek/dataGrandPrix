import { useEffect, useRef, useState, useCallback } from "react";
import { Flag, Zap, AlertTriangle, Clock } from "lucide-react";
import type { ReplayBuffer, ReplayEntry, ReplaySummary } from "../lib/replay";
import { calculateResults } from "../lib/replay";

// ─── Circuit point type ───────────────────────────────────────────────────────
interface CircuitPoint { x: number; y: number; }

// ─── Animation state for the car dot ─────────────────────────────────────────
interface CarState {
  x: number;
  y: number;
  progress: number;   // 0–1 around the track
  speed: number;      // visual speed multiplier
  isPitting: boolean;
  isSpinning: boolean;
  isFastest: boolean;
  flashColor: string | null;
  trailPoints: { x: number; y: number }[];
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface RaceReplayProps {
  buffer: ReplayBuffer;
  circuitPoints: CircuitPoint[];
  onComplete: (summary: ReplaySummary) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Interpolate a point along the circuit polyline at progress 0–1 */
function getPointOnTrack(points: CircuitPoint[], progress: number): CircuitPoint {
  if (points.length === 0) return { x: 0.5, y: 0.5 };
  const idx = Math.floor(progress * (points.length - 1));
  const t   = progress * (points.length - 1) - idx;
  const a   = points[Math.min(idx,     points.length - 1)];
  const b   = points[Math.min(idx + 1, points.length - 1)];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Convert normalised 0–1 coords to SVG pixel coords */
function toSVG(p: CircuitPoint, W: number, H: number, pad = 40): { x: number; y: number } {
  return {
    x: pad + p.x * (W - pad * 2),
    y: pad + p.y * (H - pad * 2),
  };
}

/** Color per animation type */
function flashColorFor(animation: string): string {
  switch (animation) {
    case "car_fastest":    return "#FFD700";
    case "car_spin":
    case "tyre_blown":
    case "car_collision":  return "#FF4444";
    case "yellow_flag":
    case "corner_wide":    return "#FFB800";
    case "pit_stop_short":
    case "pit_stop_long":  return "#00CFFF";
    default:               return "#FFFFFF";
  }
}

function incidentIcon(animation: string) {
  switch (animation) {
    case "car_spin":
    case "tyre_blown":
    case "car_collision":  return "💥";
    case "yellow_flag":    return "🚧";
    case "pit_stop_short":
    case "pit_stop_long":  return "🔧";
    case "car_fastest":    return "⚡";
    default:               return "→";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const SVG_W = 600;
const SVG_H = 400;
const TRAIL_LENGTH = 12;

export default function RaceReplay({ buffer, circuitPoints, onComplete }: RaceReplayProps) {
  const [currentEntryIndex, setCurrentEntryIndex] = useState(-1);
  const [currentEntry, setCurrentEntry]           = useState<ReplayEntry | null>(null);
  const [isComplete, setIsComplete]               = useState(false);
  const [car, setCar]                             = useState<CarState>({
    x: 0.5, y: 0.5, progress: 0, speed: 1,
    isPitting: false, isSpinning: false, isFastest: false,
    flashColor: null, trailPoints: [],
  });
  const [eventLog, setEventLog] = useState<{ icon: string; text: string; color: string }[]>([]);

  const animFrameRef  = useRef<number | null>(null);
  const entryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef   = useRef(0);
  const speedRef      = useRef(1);

  // ── Continuous car movement loop ──
  const moveCar = useCallback(() => {
    progressRef.current = (progressRef.current + 0.0008 * speedRef.current) % 1;
    const pt = getPointOnTrack(circuitPoints, progressRef.current);

    setCar(prev => {
      const trail = [...prev.trailPoints, { x: pt.x, y: pt.y }].slice(-TRAIL_LENGTH);
      return { ...prev, x: pt.x, y: pt.y, progress: progressRef.current, trailPoints: trail };
    });

    animFrameRef.current = requestAnimationFrame(moveCar);
  }, [circuitPoints]);

  // ── Start animation loop on mount ──
  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(moveCar);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [moveCar]);

  // ── Play through entries sequentially ──
  useEffect(() => {
    const entries = buffer.entries;
    if (entries.length === 0) {
      setTimeout(() => {
        setIsComplete(true);
        onComplete(calculateResults(buffer));
      }, 2000);
      return;
    }

    let idx = 0;

    function playNext() {
      if (idx >= entries.length) {
        // All entries played — wait a beat then complete
        entryTimerRef.current = setTimeout(() => {
          setIsComplete(true);
          onComplete(calculateResults(buffer));
        }, 2500);
        return;
      }

      const entry = entries[idx];
      setCurrentEntryIndex(idx);
      setCurrentEntry(entry);

      // Set car visual state based on animation type
      const isPitting  = entry.is_pit_stop;
      const isSpinning = entry.animation === "car_spin";
      const isFastest  = entry.animation === "car_fastest";
      const flash      = flashColorFor(entry.animation);

      // Speed multiplier: good actions fast, bad ones slow
      const speedMap: Record<string, number> = {
        car_accelerate: 2.5,
        corner_clean:   2.0,
        car_fastest:    4.0,
        corner_wide:    0.8,
        yellow_flag:    0.4,
        car_spin:       0.3,
        tyre_blown:     0.0,
        car_collision:  0.0,
        pit_stop_short: 0.0,
        pit_stop_long:  0.0,
        car_slow:       0.5,
        car_overtaken:  0.6,
      };
      speedRef.current = speedMap[entry.animation] ?? 1.0;

      setCar(prev => ({
        ...prev,
        speed:      speedRef.current,
        isPitting,
        isSpinning,
        isFastest,
        flashColor: flash,
      }));

      // Add to event log
      setEventLog(prev => [
        { icon: incidentIcon(entry.animation), text: entry.hud_message, color: flash },
        ...prev.slice(0, 6),
      ]);

      // Clear flash after 600ms
      setTimeout(() => {
        setCar(prev => ({ ...prev, flashColor: null }));
      }, 600);

      idx++;
      entryTimerRef.current = setTimeout(playNext, entry.duration_ms);
    }

    // Small initial delay so the track renders before events start
    entryTimerRef.current = setTimeout(playNext, 1200);

    return () => {
      if (entryTimerRef.current) clearTimeout(entryTimerRef.current);
    };
  }, [buffer, onComplete]);

  // ── Build SVG polyline string from circuit points ──
  const trackPolyline = circuitPoints
    .map(p => {
      const { x, y } = toSVG(p, SVG_W, SVG_H);
      return `${x},${y}`;
    })
    .join(" ");

  const carSVG = toSVG({ x: car.x, y: car.y }, SVG_W, SVG_H);

  const progress = currentEntryIndex < 0 ? 0
    : Math.round(((currentEntryIndex + 1) / Math.max(buffer.entries.length, 1)) * 100);

  return (
    <div className="race-replay-container">

      {/* Header */}
      <div className="replay-header">
        <div className="replay-title-wrap">
          <Flag size={16} />
          <span className="replay-title">Race Replay</span>
        </div>
        <div className="replay-tier" style={{ color: tierColor(buffer.tier_achieved) }}>
          {buffer.tier_achieved.toUpperCase()} — {buffer.final_quality_score}% clean
        </div>
      </div>

      {/* Main canvas */}
      <div className="replay-canvas-wrap">
        <svg
          width="100%"
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="replay-svg"
        >
          {/* Track outline — outer (thick, dark) */}
          {trackPolyline && (
            <polyline
              points={trackPolyline}
              fill="none"
              stroke="#333"
              strokeWidth="14"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {/* Track surface */}
          {trackPolyline && (
            <polyline
              points={trackPolyline}
              fill="none"
              stroke="#555"
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {/* Track kerbs / centre line */}
          {trackPolyline && (
            <polyline
              points={trackPolyline}
              fill="none"
              stroke="#666"
              strokeWidth="1"
              strokeDasharray="8 6"
              strokeLinecap="round"
              opacity="0.5"
            />
          )}

          {/* Car trail */}
          {car.trailPoints.map((pt, i) => {
            const { x, y } = toSVG(pt, SVG_W, SVG_H);
            const opacity  = (i / TRAIL_LENGTH) * 0.5;
            const r        = 3 + (i / TRAIL_LENGTH) * 3;
            return (
              <circle
                key={i}
                cx={x} cy={y} r={r}
                fill={car.isFastest ? "#FFD700" : "#FF3333"}
                opacity={opacity}
              />
            );
          })}

          {/* Car dot */}
          {!car.isPitting && (
            <>
              {/* Glow ring when fastest */}
              {car.isFastest && (
                <circle
                  cx={carSVG.x} cy={carSVG.y} r={14}
                  fill="none"
                  stroke="#FFD700"
                  strokeWidth="2"
                  opacity="0.6"
                />
              )}
              {/* Flash ring on event */}
              {car.flashColor && (
                <circle
                  cx={carSVG.x} cy={carSVG.y} r={11}
                  fill="none"
                  stroke={car.flashColor}
                  strokeWidth="2.5"
                  opacity="0.9"
                />
              )}
              <circle
                cx={carSVG.x} cy={carSVG.y} r={7}
                fill={car.flashColor ?? "#FF3333"}
                stroke="#FFF"
                strokeWidth="1.5"
              />
            </>
          )}

          {/* Pit stop indicator */}
          {car.isPitting && (
            <g>
              <circle cx={carSVG.x} cy={carSVG.y} r={12} fill="#00CFFF" opacity="0.2" />
              <text
                x={carSVG.x} y={carSVG.y + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="9"
                fill="#00CFFF"
                fontFamily="monospace"
              >PIT</text>
            </g>
          )}

          {/* Spinning indicator */}
          {car.isSpinning && (
            <circle
              cx={carSVG.x} cy={carSVG.y} r={16}
              fill="none"
              stroke="#FF4444"
              strokeWidth="2"
              strokeDasharray="4 4"
              opacity="0.8"
            />
          )}
        </svg>

        {/* Event ticker — overlaid bottom of canvas */}
        {currentEntry && (
          <div className="replay-ticker">
            <span style={{ color: flashColorFor(currentEntry.animation) }}>
              {incidentIcon(currentEntry.animation)}
            </span>
            <span className="replay-ticker-text">{currentEntry.hud_message}</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="replay-progress-wrap">
        <div
          className="replay-progress-bar"
          style={{ width: `${progress}%`, background: tierColor(buffer.tier_achieved) }}
        />
      </div>

      {/* Event log */}
      <div className="replay-event-log">
        {eventLog.map((ev, i) => (
          <div key={i} className="replay-event-row" style={{ opacity: 1 - i * 0.13 }}>
            <span>{ev.icon}</span>
            <span style={{ color: ev.color }} className="replay-event-text">{ev.text}</span>
          </div>
        ))}
      </div>

      {/* Complete overlay */}
      {isComplete && (
        <div className="replay-complete-overlay">
          <Flag size={20} />
          <span>Replay complete</span>
        </div>
      )}
    </div>
  );
}

function tierColor(tier: string): string {
  return tier === "gold" ? "#FFD700" : tier === "silver" ? "#C0C0C0" : "#CD7F32";
}
