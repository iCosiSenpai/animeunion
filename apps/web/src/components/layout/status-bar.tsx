'use client';

import { StatusPill } from '@/components/dashboard/status-pill';
import type { StatusTone } from '@/components/dashboard/tone';
import { trpc } from '@/lib/trpc';
import { useDownloadSummary } from '@/lib/use-download-summary';
import { Cpu, HardDrive } from 'lucide-react';
import Link from 'next/link';

function formatBytes(n: number | null | undefined): string {
  if (n == null) {
    return 'n/d';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Barra di stato del "centro di controllo": indicatori live sempre visibili (coda download, spazio
 * disco, worker neurale) su ogni pagina. Solo desktop (md+); su mobile lo stato coda è già nel
 * navbar. Riusa le stesse query della dashboard (react-query deduplica).
 */
export function StatusBar() {
  const health = trpc.health.status.useQuery(undefined, { refetchInterval: 20000, retry: false });
  const neural = trpc.neuralExport.status.useQuery(undefined, { retry: false });
  const { counts } = useDownloadSummary();

  const active = (counts?.downloading ?? 0) + (counts?.processing ?? 0);
  const queued = counts?.queued ?? 0;
  const free =
    (health.data?.dirs ?? []).find((d) => d.configured && d.freeBytes != null)?.freeBytes ?? null;

  const w = neural.data?.worker;
  let neuralTone: StatusTone = 'neutral';
  let neuralLabel = 'Worker offline';
  if (w?.reachable && w.ffmpegCapable && w.enabled) {
    neuralTone = 'success';
    neuralLabel = 'Worker pronto';
  } else if (w?.configured && !w.reachable) {
    neuralTone = 'warning';
    neuralLabel = 'Worker irraggiungibile';
  } else if (w?.configured) {
    neuralTone = 'neutral';
    neuralLabel = 'Worker in pausa';
  }

  return (
    <div className="hidden h-9 items-center gap-3 border-b bg-card/40 px-4 text-xs text-muted-foreground md:flex">
      <Link
        href="/downloads"
        className="flex items-center gap-2 transition-colors hover:text-foreground"
      >
        {active > 0 ? (
          <StatusPill tone="info" label={`${active} in download`} pulse />
        ) : (
          <StatusPill tone="neutral" label="Coda ferma" />
        )}
        {queued > 0 ? <span className="tabular-nums">{queued} in coda</span> : null}
      </Link>

      <span className="h-3.5 w-px bg-border" aria-hidden="true" />

      <Link
        href="/library"
        className="flex items-center gap-1.5 transition-colors hover:text-foreground"
      >
        <HardDrive className="h-3.5 w-3.5" />
        <span className="tabular-nums">{formatBytes(free)} liberi</span>
      </Link>

      {w?.configured ? (
        <>
          <span className="h-3.5 w-px bg-border" aria-hidden="true" />
          <Link
            href="/settings?section=downloadNeurale"
            className="flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <Cpu className="h-3.5 w-3.5" />
            <StatusPill tone={neuralTone} label={neuralLabel} pulse={neuralTone === 'success'} />
          </Link>
        </>
      ) : null}

      {health.data?.version ? (
        <span className="ml-auto tabular-nums text-muted-foreground/70">
          v{health.data.version}
        </span>
      ) : null}
    </div>
  );
}
