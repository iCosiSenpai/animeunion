'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { Check, ImageOff, Loader2, Search } from 'lucide-react';
import { useState } from 'react';

// Selettore wallpaper (sfondo del tema) via proxy wallhaven. Query vuota = popolari.
export function WallpaperPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const results = trpc.theme.searchWallpapers.useQuery(
    { query: submitted || undefined },
    { staleTime: 5 * 60_000 },
  );

  return (
    <div className="space-y-3">
      {value ? (
        <div className="flex items-center gap-3">
          <span className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md border bg-muted">
            <img src={value} alt="Sfondo corrente" className="h-full w-full object-cover" />
          </span>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => onChange('')}>
            <ImageOff className="h-4 w-4" />
            Rimuovi sfondo
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nessuno sfondo impostato.</p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query.trim());
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca un wallpaper anime…"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline">
          Cerca
        </Button>
      </form>

      {results.isFetching ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cerco wallpaper…
        </div>
      ) : results.data && results.data.length > 0 ? (
        <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto">
          {results.data.map((w) => {
            const active = w.fullUrl === value;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => onChange(w.fullUrl)}
                title={w.resolution}
                className={cn(
                  'relative aspect-video overflow-hidden rounded-md border transition-opacity',
                  active ? 'ring-2 ring-ring' : 'hover:opacity-80',
                )}
              >
                <img
                  src={w.thumbUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                {active ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Check className="h-5 w-5 text-white" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nessun risultato.</p>
      )}

      <p className="text-[11px] text-muted-foreground">
        Sfondi forniti da wallhaven.cc (solo SFW).
      </p>
    </div>
  );
}
