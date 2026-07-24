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
  children,
  bodyClassName,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  const hasHeader = Boolean(title || action || icon);
  return (
    <section className={cn('overflow-hidden rounded-xl border bg-card', className)}>
      {hasHeader ? (
        <header className="flex items-center gap-3 border-b px-4 py-3">
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
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}
