'use client';

import { trpc } from '@/lib/trpc';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

/**
 * Avviso non bloccante quando la cartella di download non è scrivibile oppure è ancora quella
 * predefinita (`/data/anime`, pensata per Docker e fuorviante in locale).
 */
export function SetupBanner() {
  const status = trpc.config.animePathStatus.useQuery(undefined, { staleTime: 60_000 });
  if (!status.data) {
    return null;
  }
  const { writable, isDefault, path } = status.data;
  if (writable && !isDefault) {
    return null;
  }
  const message = !writable
    ? `La cartella di download non è scrivibile: ${path}`
    : `Stai usando la cartella di download predefinita (${path}). Impostane una tua per organizzare i file.`;

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-300">
      <div className="container flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1">{message}</span>
        <Link href="/settings" className="shrink-0 font-medium underline underline-offset-2">
          Impostazioni
        </Link>
      </div>
    </div>
  );
}
