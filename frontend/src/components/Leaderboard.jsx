import React from 'react';

export default function Leaderboard({ raceTime, scorecard }) {
    const benchmark1 = 410.45;
    const benchmark2 = 420.1;

    let playerPosition = 3;
    if (!raceTime) playerPosition = '-';
    else if (raceTime < benchmark1) playerPosition = 1;
    else if (raceTime < benchmark2) playerPosition = 2;

    const rows = [
        { label: 'VER', time: benchmark1, position: playerPosition === 1 ? 2 : 1, faded: playerPosition === 1 },
        { label: 'HAM', time: benchmark2, position: playerPosition === 3 || playerPosition === '-' ? 2 : 3, faded: playerPosition !== 3 && playerPosition !== '-' }
    ];

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
            {scorecard && (
                <div className="metric-card mb-4 p-4">
                    <div className="flex justify-between text-xs uppercase tracking-[0.2em] text-slate-500">
                        <span>Data score</span>
                        <span>{scorecard.summary.final_score}/100</span>
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
                        {scorecard.summary.rows_removed} rows removed, {scorecard.summary.penalty} penalty points applied.
                    </div>
                </div>
            )}

            <div className="space-y-3">
                {playerPosition === 1 && raceTime && (
                    <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                        <div className="flex items-center space-x-3">
                            <span className="w-4 font-bold text-emerald-700">1</span>
                            <span className="font-bold tracking-wider text-slate-900">YOU</span>
                        </div>
                        <span className="font-mono font-bold text-emerald-700">{raceTime.toFixed(2)}s</span>
                    </div>
                )}

                {playerPosition === 2 && raceTime && (
                    <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <div className="flex items-center space-x-3">
                            <span className="w-4 font-bold text-amber-700">2</span>
                            <span className="font-bold tracking-wider text-slate-900">YOU</span>
                        </div>
                        <span className="font-mono font-bold text-amber-700">{raceTime.toFixed(2)}s</span>
                    </div>
                )}

                {playerPosition === 3 && raceTime && (
                    <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3">
                        <div className="flex items-center space-x-3">
                            <span className="w-4 font-bold text-red-700">3</span>
                            <span className="font-bold tracking-wider text-slate-900">YOU</span>
                        </div>
                        <span className="font-mono font-bold text-red-700">{raceTime.toFixed(2)}s</span>
                    </div>
                )}

                {rows.map((row) => (
                    <div key={row.label} className={`flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 ${row.faded ? 'opacity-60' : ''}`}>
                        <div className="flex items-center space-x-3">
                            <span className="w-4 font-bold text-slate-700">{row.position}</span>
                            <span className="font-bold tracking-wider text-slate-900">{row.label}</span>
                        </div>
                        <span className="font-mono text-slate-700">{row.time.toFixed(2)}s</span>
                    </div>
                ))}

            </div>
        </div>
    );
}
