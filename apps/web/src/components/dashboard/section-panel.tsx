import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/**
 * Superficie titolata riutilizzabile (pannello) del linguaggio "console": header con icona/titolo/
 * descrizione + azione opzionale, e corpo. Dà coesione a tutte le sezioni della dashboard.
 */
export function SectionPanel({
  title,
  description,
  icon,
  action,
  handle,
  dense,
  children,
  bodyClassName,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  /** Impugnatura di trascinamento (drag handle) mostrata a inizio header. */
  handle?: ReactNode;
  /** Densità compatta: padding ridotti. */
  dense?: boolean;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  const hasHeader = Boolean(title || action || icon || handle);
  return (
    <section className={cn('overflow-hidden rounded-xl border bg-card', className)}>
      {hasHeader ? (
        <header className={cn('flex items-center gap-2.5 border-b px-4', dense ? 'py-2' : 'py-3')}>
          {handle ? <div className="-ml-1 shrink-0">{handle}</div> : null}
          {icon ? <div className="shrink-0 text-muted-foreground">{icon}</div> : null}
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-semibold leading-tight">{title}</h2> : null}
            {description ? (
              <p className="truncate text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action ? <div className="ml-auto shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn(dense ? 'p-3' : 'p-4', bodyClassName)}>{children}</div>
    </section>
  );
}
