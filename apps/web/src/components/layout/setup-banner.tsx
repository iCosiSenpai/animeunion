'use client';

import { trpc } from '@/lib/trpc';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

/**
 * Avviso non bloccante quando la cartella di download principale (Serie · SUB ITA) non è
 * scrivibile: di solito significa che il volume non è montato o il percorso non è configurato
 * nelle Impostazioni.
 */
export function SetupBanner() {
  const dirs = trpc.config.downloadDirs.useQuery(undefined, { staleTime: 60_000 });
  if (!dirs.data) {
    return null;
  }
  const series = dirs.data.find((d) => d.key === 'seriesPathSub');
  if (!series || series.writable) {
    return null;
  }

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-300">
      <div className="container flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          La cartella di download non è scrivibile ({series.path}). Controlla il volume nel compose
          e le cartelle nelle Impostazioni.
        </span>
        <Link href="/settings" className="shrink-0 font-medium underline underline-offset-2">
          Impostazioni
        </Link>
      </div>
    </div>
  );
}
