import React, { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';

export default function SQLEditor({ onRunQuery, isLoading }) {
    const [query, setQuery] = useState('-- Write your SQL here to clean the telemetry data.\n-- Example:\n-- CREATE TABLE silver AS SELECT * FROM bronze;\n\nCREATE TABLE silver AS \nSELECT * FROM bronze;\n');
    const [editorMode, setEditorMode] = useState('monaco');
    const [monacoReady, setMonacoReady] = useState(false);

    useEffect(() => {
        if (monacoReady) return undefined;

        const timer = window.setTimeout(() => {
            setEditorMode('textarea');
        }, 1500);

        return () => window.clearTimeout(timer);
    }, [monacoReady]);

    return (
        <div className="flex h-[420px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-slate-900">SQL sandbox</h3>
                    <p className="mt-1 text-sm text-slate-500">Build or replace cleaned tables with SQL.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setEditorMode((current) => current === 'monaco' ? 'textarea' : 'monaco')}
                        className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 transition hover:text-slate-900"
                        type="button"
                    >
                        {editorMode === 'monaco' ? 'Use Plain Editor' : 'Use Monaco'}
                    </button>
                    <button
                        onClick={() => onRunQuery(query)}
                        disabled={isLoading}
                        className="cursor-pointer rounded-lg bg-red-600 px-5 py-2 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                    >
                        {isLoading ? 'Running...' : 'Run Query'}
                    </button>
                </div>
            </div>
            <div className="relative flex-1 overflow-hidden bg-slate-950">
                {editorMode === 'monaco' ? (
                    <Editor
                        height="100%"
                        defaultLanguage="sql"
                        theme="vs-dark"
                        value={query}
                        loading={<div className="h-full flex items-center justify-center text-slate-400">Loading SQL editor...</div>}
                        onChange={(value) => setQuery(value ?? '')}
                        onMount={() => setMonacoReady(true)}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            padding: { top: 16 },
                            scrollBeyondLastLine: false
                        }}
                    />
                ) : (
                    <textarea
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        className="h-full w-full resize-none border-0 bg-slate-950 p-4 font-mono text-sm text-slate-100 outline-none"
                        spellCheck={false}
                    />
                )}
            </div>
        </div>
    );
}
