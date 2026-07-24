import { cn } from '@/lib/utils';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Superficie titolata riutilizzabile (pannello) del linguaggio "console": header con icona/titolo/
 * descrizione, impugnatura di trascinamento opzionale e azione opzionale, e corpo. Se `href` è
 * valorizzato, titolo+icona diventano un link alla pagina/opzioni del widget (con affordance hover).
 */
export function SectionPanel({
  title,
  description,
  icon,
  action,
  handle,
  href,
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
  /** Se presente, titolo+icona linkano qui (pagina/opzioni del widget). */
  href?: string;
  /** Densità compatta: padding ridotti. */
  dense?: boolean;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  const hasHeader = Boolean(title || action || icon || handle);

  const titleBlock = (
    <>
      {icon ? (
        <span className="shrink-0 text-muted-foreground transition-colors group-hover/title:text-primary">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        {title ? (
          <h2 className="truncate text-sm font-semibold leading-tight transition-colors group-hover/title:text-primary">
            {title}
          </h2>
        ) : null}
        {description ? (
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {href ? (
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover/title:text-primary" />
      ) : null}
    </>
  );

  return (
    <section className={cn('overflow-hidden rounded-xl border bg-card', className)}>
      {hasHeader ? (
        <header className={cn('flex items-center gap-2.5 border-b px-4', dense ? 'py-2' : 'py-3')}>
          {handle ? <div className="-ml-1 shrink-0">{handle}</div> : null}
          {href ? (
            <Link
              href={href}
              className="group/title flex min-w-0 items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {titleBlock}
            </Link>
          ) : (
            <div className="flex min-w-0 items-center gap-2.5">{titleBlock}</div>
          )}
          {action ? <div className="ml-auto shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn(dense ? 'p-3' : 'p-4', bodyClassName)}>{children}</div>
    </section>
  );
}
