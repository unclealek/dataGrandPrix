import React from 'react';

export default function QualityScorePanel({ scorecard }) {
    if (!scorecard) {
        return (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex min-h-[180px] items-center justify-center text-slate-500">
                    Create the `gold` table to compare it against bronze and see race impact.
                </div>
            </div>
        );
    }

    const { categories, summary, remaining_issues: remainingIssues } = scorecard;

    return (
        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-3">
                {categories.map((category) => (
                    <div key={category.key} className="metric-card p-4">
                        <div className="flex justify-between items-center">
                            <span className="font-semibold text-slate-900">{category.label}</span>
                            <span className="font-mono font-bold text-teal-700">{category.display}</span>
                        </div>
                        <div className="mt-2 flex justify-between text-xs text-slate-500">
                            <span>Resolved {category.resolved} of {category.baseline}</span>
                            <span>{category.remaining} remaining</span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">{category.impact}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="metric-card p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Rows kept</div>
                    <div className="text-2xl font-bold text-slate-900">{summary.row_count}</div>
                    <div className="text-xs text-slate-500">Removed {summary.rows_removed} of {summary.baseline_row_count}</div>
                </div>
                <div className="metric-card p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Open issues</div>
                    <div className="text-2xl font-bold text-slate-900">
                        {remainingIssues.missing_lap_time + remainingIssues.missing_tire_type + remainingIssues.duplicate_driver_lap + remainingIssues.invalid_track_temp + remainingIssues.inconsistent_tire_type + remainingIssues.negative_fuel_level}
                    </div>
                    <div className="text-xs text-slate-500">Problems still affecting race pace</div>
                </div>
            </div>

            {summary.penalty > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <div className="flex justify-between items-center">
                        <span className="font-bold uppercase tracking-wider text-red-700">Over-cleaning penalty</span>
                        <span className="font-mono font-bold text-red-700">-{summary.penalty}</span>
                    </div>
                    <p className="mt-2 text-sm text-red-800">{summary.penalty_reason}</p>
                </div>
            )}

            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-4">
                <div>
                    <div className="text-lg font-semibold text-slate-900">Race readiness</div>
                    <div className="text-sm text-slate-500">Raw score {summary.total_score} before penalties</div>
                </div>
                <span className="text-4xl font-bold text-emerald-700">
                    {summary.final_score}
                </span>
            </div>
        </div>
    );
}
