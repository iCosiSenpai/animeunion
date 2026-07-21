'use client';

import { type PremiumTier, type UserProfile, hasNeuralExport } from '@animeunion/shared';
import { CalendarClock, Check, Crown, Layers, Minus, Sparkles } from 'lucide-react';

const TIER_LABEL: Record<PremiumTier, string> = {
  FAN: 'Fan',
  MEGA_FAN: 'Mega Fan',
  ULTRA_FAN: 'Ultra Fan',
};

function tierLabel(tier: string): string {
  return (TIER_LABEL as Record<string, string>)[tier] ?? tier;
}

function formatExpiry(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Pannello mostrato quando l'abbonamento e' attivo (premium.active === true). Solo stato reale:
// nessun pulsante di export (l'engine neurale e' un batch successivo). Il gate resta cooperativo.
export function PremiumStatusPanel({ profile }: { profile: UserProfile }) {
  const { premium } = profile;
  if (!premium) {
    return null;
  }
  const expiry = formatExpiry(premium.expiresAt);
  const neural = hasNeuralExport(profile);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold">AnimeUnion Premium</h2>
          <span className="ml-auto rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
            Attivo
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Piano <span className="font-medium text-foreground">{tierLabel(premium.tier)}</span>.
          Grazie per sostenere AnimeUnion.
        </p>
        {expiry && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            Attivo fino al {expiry}
          </p>
        )}
      </div>

      <div className="rounded-lg border p-4">
        <p className="text-sm font-medium">Funzioni sbloccate dal tuo piano</p>
        <ul className="mt-3 space-y-2">
          <li className="flex items-start gap-3">
            {neural ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <Minus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                Download neurale XQ/XQ+
              </p>
              <p className="text-xs text-muted-foreground">
                {neural
                  ? 'Incluso nel tuo piano. Configura il download XQ/XQ+ qui sotto.'
                  : 'Non incluso nel tuo piano attuale.'}
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
                Download simultanei
              </p>
              <p className="text-xs text-muted-foreground">
                Funzione sperimentale dell’app Docker, attiva per gli account Premium. È stata
                richiesta ad AnimeUnion una policy API dedicata.
              </p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}
