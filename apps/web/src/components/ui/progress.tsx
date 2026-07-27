import { cn } from '@/lib/utils';

interface ProgressProps {
  /** Avanzamento come frazione 0–1 (la forma in cui l'app tiene i progressi dei job). */
  value: number;
  /** Nome accessibile: una barra senza nome si annuncia solo come "25%", senza dire di cosa. */
  label: string;
  /** Alternativa leggibile alla percentuale (es. "82% usato, 120 GB liberi"). */
  valueText?: string;
  /** Classi della traccia (es. l'altezza: `h-1.5` di default). */
  className?: string;
  /** Classi dell'indicatore, per i casi che cambiano colore in base alla soglia. */
  barClassName?: string;
}

/**
 * Barra di avanzamento accessibile.
 *
 * Unifica le barre che erano duplicate a mano in download, dashboard e neural export: erano `div`
 * con una `width` in percentuale, quindi per uno screen reader non esistevano.
 *
 * Resta un `div` con ruolo esplicito invece di `<progress>`, che non è stilabile in modo coerente
 * cross-browser (traccia arrotondata + indicatore che cambia colore sopra soglia). Nessun
 * `tabIndex`: `progressbar` è un widget di sola lettura, non riceve input e non deve entrare
 * nell'ordine di tabulazione.
 */
export function Progress({ value, label, valueText, className, barClassName }: ProgressProps) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={valueText ?? `${pct}%`}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className={cn('h-full rounded-full bg-primary transition-all', barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
