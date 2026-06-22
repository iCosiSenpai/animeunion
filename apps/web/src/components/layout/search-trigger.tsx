'use client';

import { useCommandPalette } from '@/lib/command-palette-store';
import { useShortcutLabel } from '@/lib/use-shortcut-label';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';

// Finta barra di ricerca: cliccandola apre la command palette (⌘K), che fa già
// ricerca con copertine + azioni rapide.
export function SearchTrigger({
  onOpen,
  className,
}: {
  onOpen?: () => void;
  className?: string;
}) {
  const setOpen = useCommandPalette((s) => s.setOpen);
  const shortcut = useShortcutLabel('K');
  return (
    <button
      type="button"
      onClick={() => {
        onOpen?.();
        setOpen(true);
      }}
      className={cn(
        'flex h-10 w-full items-center gap-2 rounded-lg border bg-background px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">Cerca anime…</span>
      <kbd className="hidden shrink-0 rounded border px-1.5 py-0.5 text-[10px] sm:inline">
        {shortcut}
      </kbd>
    </button>
  );
}
