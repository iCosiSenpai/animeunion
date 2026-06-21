'use client';

import { useSidebar } from '@/lib/sidebar-store';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/**
 * Colonna del contenuto (navbar + main + footer). Il padding-left segue lo stato
 * della sidebar desktop così, quando questa si espande, la navbar e il contenuto
 * scorrono con lei invece di finirci sotto (toggle sempre visibile).
 */
export function AppMain({ children }: { children: ReactNode }) {
  const expanded = useSidebar((s) => s.expanded);
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col transition-[padding] duration-200',
        expanded ? 'md:pl-56' : 'md:pl-16',
      )}
    >
      {children}
    </div>
  );
}
