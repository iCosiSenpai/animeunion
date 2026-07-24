import { cn } from '@/lib/utils';
import { type StatusTone, TONES } from './tone';

/**
 * Pillola di stato: pallino colorato + etichetta, con tinta semantica indipendente dall'accent
 * dell'utente. Usata per "Pronto/In coda/Errore/..." nella dashboard e nelle viste operative.
 */
export function StatusPill({
  tone = 'neutral',
  label,
  pulse = false,
  className,
}: {
  tone?: StatusTone;
  label: string;
  /** Anima il pallino (es. attività in corso). */
  pulse?: boolean;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        t.bg,
        t.text,
        t.ring,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', t.dot, pulse && 'animate-pulse')} />
      {label}
    </span>
  );
}
