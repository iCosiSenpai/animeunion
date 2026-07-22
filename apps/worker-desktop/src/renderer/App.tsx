import { useCallback, useEffect, useState } from 'react';
import type { DesktopStatus } from '../shared/status';
import { PairingSection } from './PairingSection';

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

  const overall = status ? OVERALL[status.overall] : OVERALL.starting;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-8 py-10">
        <header className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500" />
          <div>
            <h1 className="text-lg font-semibold leading-tight">AnimeUnion Worker</h1>
            <p className="text-sm text-slate-400">Upscale neurale sul tuo PC con GPU</p>
          </div>
        </header>

        <section className={`rounded-2xl bg-slate-900 p-6 ring-1 ${overall.ring}`}>
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${overall.dot}`} aria-hidden="true" />
            <span className="text-sm font-medium uppercase tracking-wide text-slate-300">
              {overall.label}
            </span>
          </div>
          <p className="mt-3 text-xl font-semibold">{status?.headline ?? 'Caricamento…'}</p>
          {status?.worker.port && (
            <p className="mt-1 text-sm text-slate-400">
              In ascolto su {status.worker.host}:{status.worker.port}
            </p>
          )}
        </section>

        <section className="rounded-2xl bg-slate-900 p-6">
          <h2 className="text-sm font-semibold text-slate-300">GPU e ffmpeg</h2>
          {status?.gpu ? (
            <div className="mt-2">
              <p className={status.gpu.ok ? 'text-emerald-400' : 'text-red-400'}>
                {status.gpu.title}
              </p>
              {status.gpu.hint && <p className="mt-1 text-sm text-slate-400">{status.gpu.hint}</p>}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-400">Verifica in corso…</p>
          )}
        </section>

        <section className="flex flex-wrap items-center gap-3">
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
            Apri i log
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
        </section>

        <PairingSection />
      </div>
    </div>
  );
}
