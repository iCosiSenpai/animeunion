'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCommandPalette } from '@/lib/command-palette-store';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

// Destinazioni del prefisso "g" (vim-like): g + lettera.
const GO_TO: Record<string, string> = {
  h: '/',
  c: '/catalog',
  f: '/follows',
  l: '/library',
  a: '/calendar',
  d: '/downloads',
  t: '/statistiche',
  s: '/settings',
};

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: 'g h', label: 'Home' },
  { keys: 'g c', label: 'Catalogo' },
  { keys: 'g f', label: 'Seguiti' },
  { keys: 'g l', label: 'Libreria' },
  { keys: 'g a', label: 'Calendario' },
  { keys: 'g d', label: 'Download' },
  { keys: 'g t', label: 'Statistiche' },
  { keys: 'g s', label: 'Impostazioni' },
  { keys: '/', label: 'Cerca / palette comandi' },
  { keys: '⌘/Ctrl K', label: 'Palette comandi' },
  { keys: '?', label: 'Questa guida' },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const setPaletteOpen = useCommandPalette((s) => s.setOpen);
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingG = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearPending = () => {
      pendingG.current = false;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) {
        return;
      }

      // Sequenza "g" + lettera.
      if (pendingG.current) {
        const dest = GO_TO[event.key.toLowerCase()];
        clearPending();
        if (dest) {
          event.preventDefault();
          router.push(dest);
        }
        return;
      }

      if (event.key === 'g') {
        pendingG.current = true;
        timer.current = setTimeout(clearPending, 1000);
        return;
      }
      if (event.key === '/') {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        setHelpOpen(true);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearPending();
    };
  }, [router, setPaletteOpen]);

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Scorciatoie da tastiera</DialogTitle>
          <DialogDescription>
            Premi i tasti indicati (non mentre scrivi in un campo).
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y text-sm">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between py-2">
              <span className="text-muted-foreground">{s.label}</span>
              <kbd className="rounded border bg-muted px-2 py-0.5 text-xs font-medium">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
