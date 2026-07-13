'use client';

import { trpc } from '@/lib/trpc';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

/**
 * Avviso non bloccante guidato dallo stato del Doctor: compare quando almeno una cartella di
 * download risulta non scrivibile (di solito il volume non è montato o il percorso è sbagliato) e
 * sparisce da solo appena il Doctor rileva il ripristino (nessun refresh manuale richiesto).
 */
export function SetupBanner() {
  const doctor = trpc.doctor.state.useQuery(undefined, {
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  if (!doctor.data) {
    return null;
  }
  const broken = doctor.data.checks.filter(
    (c) => c.category === 'writable' && c.status === 'critical',
  );
  if (broken.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-300">
      <div className="container flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          {broken.length === 1
            ? `La cartella di download non è scrivibile (${broken[0]?.detail}). Controlla il volume nel compose e le cartelle nelle Impostazioni.`
            : `${broken.length} cartelle di download non sono scrivibili. Controlla il volume nel compose e le cartelle nelle Impostazioni.`}
        </span>
        <Link href="/diagnostica" className="shrink-0 font-medium underline underline-offset-2">
          Doctor
        </Link>
      </div>
    </div>
  );
}
