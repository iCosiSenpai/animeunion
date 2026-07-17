'use client';

import { PremiumStatusPanel } from '@/components/settings/premium-status';
import { PremiumUpsell } from '@/components/settings/premium-upsell';
import { Button } from '@/components/ui/button';
import { QueryError } from '@/components/ui/query-error';
import { trpc } from '@/lib/trpc';
import { isPremiumActive } from '@animeunion/shared';
import { Settings2 } from 'lucide-react';
import Link from 'next/link';

// Destinazione di primo livello per il Premium (voce sidebar), non piu' solo un tab sepolto in
// Impostazioni. Mostra lo stato reale (PremiumStatusPanel) se l'abbonamento e' attivo, altrimenti
// la vetrina (PremiumUpsell). La config del worker Neural Export resta in Impostazioni (Step 8 la
// spostera'): qui c'e' solo un rimando. Vedi Step 4 v0.16.0.
export function PremiumView() {
  const profileQuery = trpc.profile.me.useQuery(undefined, { retry: false });
  const active = isPremiumActive(profileQuery.data);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Premium</h1>
        <p className="text-sm text-muted-foreground">
          {active
            ? 'Il tuo abbonamento e le funzioni che sblocca nell’app.'
            : 'Sostieni AnimeUnion e sblocca funzioni extra nell’app.'}
        </p>
      </div>

      {profileQuery.isLoading ? (
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : profileQuery.isError ? (
        <QueryError
          title="Impossibile caricare il tuo profilo"
          description="Controlla la connessione all’account AnimeUnion e riprova."
          onRetry={() => void profileQuery.refetch()}
        />
      ) : isPremiumActive(profileQuery.data) ? (
        <div className="space-y-4">
          <PremiumStatusPanel profile={profileQuery.data} />
          <div className="flex items-start gap-3 rounded-lg border p-4">
            <Settings2
              className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-2">
              <div>
                <p className="text-sm font-medium">Download neurale (XQ/XQ+)</p>
                <p className="text-xs text-muted-foreground">
                  Configura il PC con GPU che esegue l’upscale sulla LAN.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/settings?section=downloadNeurale">Configura il worker</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <PremiumUpsell />
      )}
    </div>
  );
}
