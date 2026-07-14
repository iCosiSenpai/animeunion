'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import type { Wallpaper } from '@animeunion/shared';
import {
  Check,
  Download,
  ExternalLink,
  Heart,
  ImageOff,
  Loader2,
  Search,
  SlidersHorizontal,
  ZoomIn,
} from 'lucide-react';
import { useState } from 'react';

type Sorting = 'auto' | 'toplist' | 'favorites';

const SORTINGS: { value: Sorting; label: string }[] = [
  { value: 'auto', label: 'Consigliati' },
  { value: 'toplist', label: 'Più votati' },
  { value: 'favorites', label: 'Più amati' },
];

// Formatta il conteggio preferiti in modo compatto (2145 -> "2.1k").
function formatFavorites(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(n);
}

// Selettore wallpaper (sfondo del tema) via proxy wallhaven. Query vuota = popolari.
// Categoria sempre Anime; il filtro "Sketchy" aggiunge i contenuti artistici (purity 110).
export function WallpaperPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [sketchy, setSketchy] = useState(false);
  const [sorting, setSorting] = useState<Sorting>('auto');
  const [preview, setPreview] = useState<Wallpaper | null>(null);

  const results = trpc.theme.searchWallpapers.useQuery(
    { query: submitted || undefined, sketchy, sorting: sorting === 'auto' ? undefined : sorting },
    { staleTime: 5 * 60_000 },
  );
  const filtersActive = sketchy || sorting !== 'auto';

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

        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="relative"
              aria-label="Filtri"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {filtersActive ? (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary" />
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Filtri</p>
              <p className="text-xs text-muted-foreground">Categoria: Anime.</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Ordina per</p>
              <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Ordinamento">
                {SORTINGS.map((s) => (
                  <Button
                    key={s.value}
                    type="button"
                    variant={sorting === s.value ? 'default' : 'outline'}
                    size="sm"
                    // biome-ignore lint/a11y/useSemanticElements: styled radio in a segmented control
                    role="radio"
                    aria-checked={sorting === s.value}
                    onClick={() => setSorting(s.value)}
                    className="h-8 px-1 text-xs"
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              type="button"
              variant={sketchy ? 'default' : 'outline'}
              size="sm"
              aria-pressed={sketchy}
              onClick={() => setSketchy((v) => !v)}
              className="w-full justify-start gap-2"
            >
              <Check className={cn('h-4 w-4', sketchy ? 'opacity-100' : 'opacity-0')} />
              Sketchy (contenuti artistici)
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Include sfondi più audaci ma non espliciti. Disattivo = solo SFW.
            </p>
          </PopoverContent>
        </Popover>

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
        <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {results.data.map((w) => {
            const active = w.fullUrl === value;
            return (
              <div
                key={w.id}
                className={cn(
                  'relative overflow-hidden rounded-md border',
                  active && 'ring-2 ring-ring',
                )}
              >
                {/* È l'<img> (elemento replaced) a dare l'altezza della cella tramite aspect-video:
                    così il box non collassa a 0 su iOS Safari — dove aspect-ratio su un box con soli
                    figli assoluti non stabilisce l'altezza — evitando le anteprime accavallate. */}
                <button
                  type="button"
                  onClick={() => onChange(w.fullUrl)}
                  title={w.resolution}
                  className="block w-full transition-opacity hover:opacity-80"
                >
                  <img
                    src={w.thumbUrl}
                    alt=""
                    loading="lazy"
                    className="aspect-video w-full object-cover"
                  />
                </button>
                {active ? (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
                    <Check className="h-5 w-5 text-white" />
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setPreview(w)}
                  aria-label="Anteprima a schermo intero"
                  title="Anteprima"
                  className="absolute right-1 top-1 z-10 rounded-md bg-black/60 p-1.5 text-white transition hover:bg-black/80"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                {typeof w.favorites === 'number' && w.favorites > 0 ? (
                  <span className="pointer-events-none absolute bottom-1 left-1 z-10 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
                    <Heart className="h-3 w-3 fill-current" aria-hidden="true" />
                    {formatFavorites(w.favorites)}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nessun risultato.</p>
      )}

      <p className="text-[11px] text-muted-foreground">
        Sfondi forniti da wallhaven.cc. SFW di default; abilita «Sketchy» nei filtri per contenuti
        artistici.
      </p>

      <Dialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Anteprima sfondo</DialogTitle>
          </DialogHeader>
          {preview ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-md border bg-muted">
                <img src={preview.fullUrl} alt="" className="max-h-[60dvh] w-full object-contain" />
              </div>
              <p className="text-xs text-muted-foreground">{preview.resolution}</p>
              <DialogFooter className="gap-2">
                <Button variant="outline" asChild>
                  <a
                    href={preview.fullUrl}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Scarica
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a
                    href={preview.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Apri su wallhaven
                  </a>
                </Button>
                <Button
                  className="gap-2"
                  onClick={() => {
                    onChange(preview.fullUrl);
                    setPreview(null);
                  }}
                >
                  <Check className="h-4 w-4" />
                  Imposta come sfondo
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
