'use client';

import { cn } from '@/lib/utils';
import { Crown, Lock } from 'lucide-react';
import { PREMIUM_URL } from './premium-upsell';

// Primitive riusabili per rendere VISIBILE che una funzione e' un perk Premium, sia quando e'
// sbloccata (l'account e' Premium) sia quando e' bloccata. Varianti esplicite invece di boolean
// prop: ogni contesto usa il pezzo che gli serve. Vedi Step 3 v0.16.0.

/**
 * Riga esplicativa da mostrare SOTTO un controllo gia' sbloccato dal Premium: ricorda che la
 * funzione e' disponibile grazie all'abbonamento (il perk resta visibile anche da attivo).
 */
export function PremiumUnlockedNote({ className }: { className?: string }) {
  return (
    <p className={cn('mt-1.5 flex items-center gap-1.5 text-xs text-primary', className)}>
      <Crown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Sbloccato col tuo piano Premium
    </p>
  );
}

/**
 * Sostituto "bloccato" di un controllo Premium: lucchetto + valore di ripiego + link all'upsell.
 * Estrae il markup prima duplicato inline in settings-view (download simultanei).
 */
export function PremiumLockedNote({
  fallbackLabel,
  className,
}: {
  fallbackLabel: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground',
        className,
      )}
    >
      <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{fallbackLabel}</span>
      <a
        href={PREMIUM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-1 rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary transition-colors hover:bg-primary/10"
      >
        Premium
      </a>
    </div>
  );
}

/**
 * Mini-badge "Premium" da appendere in linea a una voce (es. item di un dropdown) per marcarla
 * come perk anche quando e' gia' cliccabile perche' sbloccata.
 */
export function PremiumInlineBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'ml-auto inline-flex items-center gap-1 rounded-full border border-primary/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary',
        className,
      )}
    >
      <Crown className="h-3 w-3" aria-hidden="true" />
      Premium
    </span>
  );
}
