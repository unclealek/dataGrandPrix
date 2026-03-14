import React, { useEffect, useRef, useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';

export default function RaceReplay({ raceResults }) {
    const canvasRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentLap, setCurrentLap] = useState(0);
    const [raceTime, setRaceTime] = useState(0);
    const animationRef = useRef(null);

    const drawFrame = (ctx, progress, cx, cy, tw, th) => {
        // Clear canvas
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Draw Track
        ctx.beginPath();
        ctx.ellipse(cx, cy, tw / 2, th / 2, 0, 0, 2 * Math.PI);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 14;
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(cx, cy, tw / 2, th / 2, 0, 0, 2 * Math.PI);
        ctx.strokeStyle = '#444';
        ctx.setLineDash([10, 15]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw Start/Finish line
        ctx.fillStyle = '#fff';
        ctx.fillRect(cx - 2, cy - th / 2 - 8, 4, 16);

        // Compute Car Position (start at 12 o'clock, go clockwise)
        const angle = progress * 2 * Math.PI - (Math.PI / 2);
        const carX = cx + (tw / 2) * Math.cos(angle);
        const carY = cy + (th / 2) * Math.sin(angle);

        // Draw Car
        ctx.beginPath();
        ctx.arc(carX, carY, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#E10600'; // F1 Red
        ctx.fill();
        ctx.shadowColor = '#E10600';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas && raceResults) {
            const ctx = canvas.getContext('2d');
            drawFrame(ctx, 0, canvas.width / 2, canvas.height / 2, canvas.width * 0.8, canvas.height * 0.6);
        }
        setIsPlaying(false);
        setCurrentLap(0);
        setRaceTime(0);
    }, [raceResults]);

    useEffect(() => {
        if (!raceResults || !isPlaying) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        const trackWidth = canvas.width * 0.8;
        const trackHeight = canvas.height * 0.6;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        let startTime = performance.now();
        let currentLapIndex = 0;
        const animationSpeedFactor = 40;

        const animate = (time) => {
            const elapsed = time - startTime;
            const targetLap = raceResults.laps[currentLapIndex];

            if (!targetLap && currentLapIndex >= raceResults.laps.length) {
                setIsPlaying(false);
                return;
            }

            const targetLapAnimTime = (targetLap.lap_time * 1000) / animationSpeedFactor;
            let progress = elapsed / targetLapAnimTime;

            if (progress >= 1) {
                progress = 1;
                setRaceTime(prev => prev + targetLap.lap_time);
                setCurrentLap(targetLap.lap);
                currentLapIndex++;
                if (currentLapIndex < raceResults.laps.length) {
                    startTime = performance.now(); // fetch fresh time to avoid skipping
                    progress = 0;
                } else {
                    setIsPlaying(false);
                    drawFrame(ctx, 1, centerX, centerY, trackWidth, trackHeight);
                    return;
                }
            } else {
                // smooth time
                setRaceTime((currentLapIndex > 0 ? raceResults.laps.slice(0, currentLapIndex).reduce((acc, l) => acc + l.lap_time, 0) : 0) + (progress * targetLap.lap_time));
            }

            drawFrame(ctx, progress, centerX, centerY, trackWidth, trackHeight);
            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => cancelAnimationFrame(animationRef.current);
    }, [isPlaying, raceResults]);

    const startReplay = () => {
        setCurrentLap(0);
        setRaceTime(0);
        setIsPlaying(true);
    };

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Race replay</h3>
                {raceResults && (
                    <button
                        onClick={startReplay}
                        disabled={isPlaying}
                        className="flex cursor-pointer items-center space-x-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isPlaying ? <RotateCcw size={16} className="animate-spin" /> : <Play size={16} />}
                        <span>{isPlaying ? 'Racing...' : 'Start'}</span>
                    </button>
                )}
            </div>

            {!raceResults ? (
                <div className="flex h-[200px] items-center justify-center text-slate-500">
                    Run a race simulation to view the replay.
                </div>
            ) : (
                <div className="flex flex-col items-center">
                    <canvas
                        ref={canvasRef}
                        width={400}
                        height={200}
                        className="mb-4 h-[200px] w-full max-w-[400px] rounded-xl border border-slate-200 bg-slate-50"
                    />

                    <div className="grid w-full grid-cols-2 gap-4">
                        <div className="metric-card p-4 text-center">
                            <div className="text-xs uppercase tracking-wider text-slate-500">Current lap</div>
                            <div className="text-2xl font-mono text-slate-900">
                                {currentLap} <span className="text-sm text-slate-500">/ {raceResults.laps?.length}</span>
                            </div>
                        </div>

                        <div className="metric-card p-4 text-center">
                            <div className="text-xs uppercase tracking-wider text-slate-500">Race time</div>
                            <div className="text-2xl font-mono text-teal-700">
                                {raceTime.toFixed(2)}s
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 grid w-full grid-cols-3 gap-3">
                        <div className="metric-card p-3 text-center">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Base lap</div>
                            <div className="text-lg font-mono text-slate-900">{raceResults.summary.base_lap}s</div>
                        </div>
                        <div className="metric-card p-3 text-center">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Score bonus</div>
                            <div className="text-lg font-mono text-emerald-700">-{raceResults.summary.pace_bonus}s</div>
                        </div>
                        <div className="metric-card p-3 text-center">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Issue penalty</div>
                            <div className="text-lg font-mono text-red-700">+{raceResults.summary.issue_penalties}s</div>
                        </div>
                    </div>

                    {raceResults.events?.length > 0 && (
                        <div className="mt-4 w-full space-y-2">
                            {raceResults.events.map((event) => {
                                const isActive = currentLap >= event.lap && currentLap > 0;
                                return (
                                    <div
                                        key={`${event.type}-${event.lap}-${event.title}`}
                                        className={`rounded-lg border p-3 text-sm ${isActive ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-slate-900">Lap {event.lap}: {event.title}</span>
                                            <span className="font-mono text-red-700">+{event.penalty_seconds}s</span>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-600">{event.detail}</p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
