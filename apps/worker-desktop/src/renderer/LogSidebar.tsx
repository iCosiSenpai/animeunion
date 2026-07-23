import { useEffect, useRef, useState } from 'react';
import type { LogLine } from '../shared/ipc';

const LEVEL_COLOR: Record<string, string> = {
  trace: 'text-slate-500',
  debug: 'text-slate-400',
  info: 'text-slate-300',
  warn: 'text-amber-400',
  error: 'text-red-400',
  fatal: 'text-red-500',
};

const MAX_RENDERED = 500;

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString('it-IT', { hour12: false });
}

/** Sidebar dei log a comparsa: backlog iniziale + stream in tempo reale, con auto-scroll. */
export function LogSidebar({ onClose }: { onClose: () => void }): JSX.Element {
  const [lines, setLines] = useState<LogLine[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    void window.workerApi.getLogs().then((backlog) => setLines(backlog.slice(-MAX_RENDERED)));
    const off = window.workerApi.onLog((line) => {
      setLines((prev) => {
        const next = [...prev, line];
        return next.length > MAX_RENDERED ? next.slice(-MAX_RENDERED) : next;
      });
    });
    return off;
  }, []);

  // Auto-scroll in fondo solo se l'utente è già in fondo (non strappa lo scroll durante la lettura).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `lines` è il trigger per ri-scrollare a ogni nuova riga.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines]);

  const onScroll = (): void => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-slate-800 bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-300">Log</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
        >
          Nascondi
        </button>
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed"
      >
        {lines.length === 0 ? (
          <p className="text-slate-600">Nessun log ancora.</p>
        ) : (
          lines.map((line, i) => (
            <div key={`${line.time}-${i}`} className="whitespace-pre-wrap break-words">
              <span className="text-slate-600">{formatTime(line.time)}</span>{' '}
              <span className={LEVEL_COLOR[line.level] ?? 'text-slate-300'}>{line.msg}</span>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
