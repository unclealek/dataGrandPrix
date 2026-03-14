import React from 'react';

export default function DatasetViewer({ data, title = "Dataset" }) {
    if (!data || data.length === 0) {
        return (
            <div className="flex min-h-[420px] flex-col rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-4">
                    <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                </div>
                <div className="flex flex-1 items-center justify-center px-6 text-slate-500">
                    No data available. Run a query first.
                </div>
            </div>
        );
    }

    const columns = Object.keys(data[0]);

    return (
        <div className="flex h-[60vh] max-h-[700px] flex-col rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                    <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                    <p className="mt-1 text-sm text-slate-500">Showing the current dataset preview.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{data.length} rows</span>
            </div>
            <div className="table-scroll flex-1 overflow-auto">
                <table className="w-full text-sm text-left relative">
                    <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase text-slate-600">
                        <tr>
                            {columns.map((col) => (
                                <th key={col} className="whitespace-nowrap border-b border-slate-200 px-4 py-3 font-semibold tracking-wider">{col}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, i) => (
                            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                                {columns.map((col) => {
                                    const val = row[col];
                                    const isNullOrNone = val === null || val === 'None';
                                    return (
                                        <td key={col} className={`whitespace-nowrap px-4 py-2.5 ${isNullOrNone ? 'font-semibold italic text-rose-600' : 'text-slate-700'}`}>
                                            {isNullOrNone ? 'NULL' : String(val)}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
