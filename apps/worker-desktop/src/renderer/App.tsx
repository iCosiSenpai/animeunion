import { useCallback, useEffect, useState } from 'react';
import type { GpuTestResult } from '../shared/ipc';
import type { DesktopStatus } from '../shared/status';
import { ConnectionSection } from './ConnectionSection';
import { LogSidebar } from './LogSidebar';

const OVERALL: Record<DesktopStatus['overall'], { dot: string; ring: string; label: string }> = {
  ready: { dot: 'bg-emerald-500', ring: 'ring-emerald-500/30', label: 'Pronto' },
  starting: { dot: 'bg-amber-400', ring: 'ring-amber-400/30', label: 'In avvio' },
  blocked: { dot: 'bg-red-500', ring: 'ring-red-500/30', label: 'Bloccato' },
  error: { dot: 'bg-red-500', ring: 'ring-red-500/30', label: 'Errore' },
  stopped: { dot: 'bg-slate-500', ring: 'ring-slate-500/30', label: 'Fermo' },
};

export function App(): JSX.Element {
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [autostart, setAutostart] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  const [gpuTesting, setGpuTesting] = useState(false);
  const [gpuResult, setGpuResult] = useState<GpuTestResult | null>(null);

  useEffect(() => {
    void window.workerApi.getStatus().then(setStatus);
    void window.workerApi.getAutostart().then(setAutostart);
    const off = window.workerApi.onStatusChanged(setStatus);
    return off;
  }, []);

  const onRestart = useCallback(async () => {
    setRestarting(true);
    try {
      setStatus(await window.workerApi.restartWorker());
    } finally {
      setRestarting(false);
    }
  }, []);

  const onToggleAutostart = useCallback(async () => {
    const next = await window.workerApi.setAutostart(!autostart);
    setAutostart(next);
  }, [autostart]);

  const onGpuTest = useCallback(async () => {
    setGpuTesting(true);
    setGpuResult(null);
    try {
      setGpuResult(await window.workerApi.gpuTest());
    } finally {
      setGpuTesting(false);
    }
  }, []);

  const overall = status ? OVERALL[status.overall] : OVERALL.starting;

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-800 px-6 py-4">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500" />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight">AnimeUnion Worker</h1>
            <p className="truncate text-sm text-slate-400">Upscale neurale sul tuo PC con GPU</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-300">
              <span className={`h-2.5 w-2.5 rounded-full ${overall.dot}`} aria-hidden="true" />
              {overall.label}
            </span>
            <button
              type="button"
              onClick={() => setLogsOpen((v) => !v)}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
            >
              {logsOpen ? 'Nascondi log' : 'Mostra log'}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-2xl flex-col gap-6 px-8 py-8">
            <section className={`rounded-2xl bg-slate-900 p-6 ring-1 ${overall.ring}`}>
              <p className="text-xl font-semibold">{status?.headline ?? 'Caricamento…'}</p>
              {status?.worker.port && (
                <p className="mt-1 text-sm text-slate-400">
                  In ascolto sulla porta {status.worker.port}
                </p>
              )}
            </section>

            <section className="rounded-2xl bg-slate-900 p-6">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-slate-300">GPU e ffmpeg</h2>
                <button
                  type="button"
                  onClick={() => void onGpuTest()}
                  disabled={gpuTesting}
                  className="ml-auto rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                >
                  {gpuTesting ? 'Test in corso…' : 'Test GPU'}
                </button>
              </div>
              {status?.gpu ? (
                <div className="mt-2">
                  <p className={status.gpu.ok ? 'text-emerald-400' : 'text-red-400'}>
                    {status.gpu.title}
                  </p>
                  {status.gpu.hint && (
                    <p className="mt-1 text-sm text-slate-400">{status.gpu.hint}</p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-400">Verifica in corso…</p>
              )}
              {gpuResult && (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <p className={gpuResult.ok ? 'text-sm text-emerald-400' : 'text-sm text-red-400'}>
                    {gpuResult.message}
                  </p>
                  {!gpuResult.ok && gpuResult.logTail && (
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-slate-500">
                      {gpuResult.logTail}
                    </pre>
                  )}
                </div>
              )}
            </section>

            <ConnectionSection />

            <section className="rounded-2xl bg-slate-900 p-6">
              <h2 className="text-sm font-semibold text-slate-300">Opzioni</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void onRestart()}
                  disabled={restarting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  {restarting ? 'Riavvio…' : 'Riavvia worker'}
                </button>
                <button
                  type="button"
                  onClick={() => void window.workerApi.openLogs()}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
                >
                  Apri cartella log
                </button>
                <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={autostart}
                    onChange={() => void onToggleAutostart()}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                  />
                  Avvia al login
                </label>
              </div>
            </section>
          </div>
        </div>
      </div>

      {logsOpen && <LogSidebar onClose={() => setLogsOpen(false)} />}
    </div>
  );
}
