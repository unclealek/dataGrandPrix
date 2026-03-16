import { useEffect, useMemo, useState } from "react";
import { Flag, Gauge, Trophy } from "lucide-react";
import { formatLapTime, summariseReplay, type ReplayBuffer } from "./lib/replay";

interface CircuitPoint {
  x: number;
  y: number;
}

interface RaceReplayProps {
  buffer: ReplayBuffer;
  circuitPoints: CircuitPoint[];
  rotationDeg?: number;
  onComplete: (summary: NonNullable<ReturnType<typeof summariseReplay>>) => void;
}

function pointAtTrackPosition(points: CircuitPoint[], trackPosition: number) {
  if (points.length === 0) {
    return { x: 0.5, y: 0.5 };
  }

  const scaledIndex = trackPosition * (points.length - 1);
  const startIndex = Math.floor(scaledIndex);
  const endIndex = Math.min(points.length - 1, startIndex + 1);
  const weight = scaledIndex - startIndex;
  const start = points[startIndex];
  const end = points[endIndex];

  return {
    x: start.x + (end.x - start.x) * weight,
    y: start.y + (end.y - start.y) * weight,
  };
}

export default function RaceReplay({ buffer, circuitPoints, rotationDeg = 0, onComplete }: RaceReplayProps) {
  const summary = useMemo(() => summariseReplay(buffer), [buffer]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [displayTrackPosition, setDisplayTrackPosition] = useState(buffer.entries[0]?.track_position ?? 0);

  useEffect(() => {
    const replaySummary = summary;
    if (!replaySummary || buffer.entries.length === 0) {
      return;
    }

    let frameId = 0;
    let timeoutId = 0;
    let cancelled = false;

    function runEntry(index: number) {
      if (cancelled) {
        return;
      }

      if (index >= buffer.entries.length) {
        onComplete(replaySummary as NonNullable<ReturnType<typeof summariseReplay>>);
        return;
      }

      setActiveIndex(index);
      const current = buffer.entries[index];
      const next = buffer.entries[index + 1];
      const start = performance.now();
      const from = current.track_position;
      const to = next?.track_position ?? Math.min(1, current.track_position + 0.02);

      const animate = (now: number) => {
        const progress = Math.min(1, (now - start) / current.duration_ms);
        setDisplayTrackPosition(from + (to - from) * progress);
        if (progress < 1 && !cancelled) {
          frameId = window.requestAnimationFrame(animate);
        }
      };

      frameId = window.requestAnimationFrame(animate);
      timeoutId = window.setTimeout(() => runEntry(index + 1), current.duration_ms);
    }

    setActiveIndex(0);
    setDisplayTrackPosition(buffer.entries[0].track_position);
    runEntry(0);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [buffer, onComplete, summary]);

  const activeEntry = buffer.entries[activeIndex] ?? null;
  const carPoint = pointAtTrackPosition(circuitPoints, displayTrackPosition);
  const pathData = circuitPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x * 100} ${point.y * 100}`)
    .join(" ");

  if (!summary) {
    return null;
  }

  return (
    <section className="replay-panel">
      <div className="replay-card">
        <div className="replay-head">
          <div className="replay-title-wrap">
            <Flag size={18} />
            <div>
              <p className="section-kicker">Circuit Replay</p>
              <h3>Current Cleaning Run</h3>
            </div>
          </div>
        </div>
        <div className="replay-body">
          <div className="replay-meta">
            <div className="replay-meta-card">
              <Gauge size={16} />
              <span>{activeEntry ? `${activeEntry.speed_at_event} km/h` : "0 km/h"}</span>
            </div>
            <div className="replay-meta-card">
              <Trophy size={16} />
              <span>{summary.tierAchieved.toUpperCase()}</span>
            </div>
            <div className="replay-meta-card">
              <span>{formatLapTime(summary.finalLapTimeMs)}</span>
            </div>
          </div>

          <div className="replay-circuit-shell">
            <svg viewBox="-6 -6 112 112" preserveAspectRatio="xMidYMid meet" className="replay-circuit">
              <g transform={`rotate(${rotationDeg} 50 50)`}>
                <path d={pathData} className="replay-circuit-path" />
                <circle cx={carPoint.x * 100} cy={carPoint.y * 100} r="2.4" className="replay-car-dot" />
              </g>
            </svg>
          </div>

          <div className="replay-feed">
            <strong>{activeEntry?.race_event ?? "GRID_READY"}</strong>
            <p>{activeEntry?.hud_message ?? "Preparing replay telemetry."}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
