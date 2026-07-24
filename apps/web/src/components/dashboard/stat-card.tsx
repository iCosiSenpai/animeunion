import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { type StatusTone, TONES } from './tone';

/**
 * KPI card della dashboard: etichetta, valore (numeri tabellari per il look "console"), unità
 * opzionale, icona con tinta semantica e sottotesto. È il mattone dei riepiloghi (coda, disco, ...).
 */
export function StatCard({
  label,
  value,
  unit,
  icon,
  tone = 'neutral',
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  icon?: ReactNode;
  tone?: StatusTone;
  hint?: ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border bg-card p-4', className)}>
      {icon ? (
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            t.iconBg,
            t.iconText,
          )}
        >
          {icon}
        </div>
      ) : null}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 flex items-baseline gap-1">
          <span className="text-2xl font-semibold leading-none tabular-nums">{value}</span>
          {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
        </p>
        {hint ? <div className="mt-1 truncate text-xs text-muted-foreground">{hint}</div> : null}
      </div>
    </div>
  );
}
