'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { Clapperboard, FolderTree, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';

export type ClassifyKind = 'tv' | 'movie' | 'special';

export interface ClassifyValue {
  kind: ClassifyKind;
  /** Numero di stagione come stringa (solo per kind === 'tv'). */
  season: string;
  /** Parte della stagione come stringa (1 = parte unica), solo per kind === 'tv'. */
  part: string;
  /** Serie madre scelta (cartella del franchise), solo per kind === 'tv'. */
  parentId: string | null;
  parentTitle: string;
}

const KIND_OPTIONS: { kind: ClassifyKind; label: string; icon: typeof FolderTree }[] = [
  { kind: 'tv', label: 'Stagione', icon: FolderTree },
  { kind: 'special', label: 'Special', icon: Sparkles },
  { kind: 'movie', label: 'Film', icon: Clapperboard },
];

/**
 * Campi condivisi per classificare un titolo (tipo + stagione + serie madre) con anteprima
 * live del percorso su disco. Usato dal dialog "Classifica e scarica" e dal pannello
 * "Organizzazione file".
 */
export function ClassifyFields({
  animeId,
  value,
  onChange,
}: {
  animeId: string;
  value: ClassifyValue;
  onChange: (v: ClassifyValue) => void;
}) {
  const [search, setSearch] = useState('');
  const searchQuery = trpc.catalog.search.useQuery(
    { query: search },
    { enabled: search.trim().length >= 2 },
  );

  const seasonNum = Number(value.season);
  const partNum = Number(value.part);
  const preview = trpc.series.previewPath.useQuery({
    animeId,
    kind: value.kind,
    seasonNumber:
      value.kind === 'tv' && Number.isFinite(seasonNum) && seasonNum >= 1 ? seasonNum : undefined,
    seriesAnimeId: value.kind === 'tv' ? value.parentId : undefined,
    partNumber:
      value.kind === 'tv' && Number.isFinite(partNum) && partNum >= 1 ? partNum : undefined,
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Tipo</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Tipo">
          {KIND_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isOn = value.kind === opt.kind;
            return (
              <button
                key={opt.kind}
                type="button"
                // biome-ignore lint/a11y/useSemanticElements: custom styled radio button
                role="radio"
                onClick={() => onChange({ ...value, kind: opt.kind })}
                aria-checked={isOn}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isOn
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {value.kind === 'tv' ? (
        <>
          <div className="space-y-1.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Numero di stagione</p>
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={value.season}
                  onChange={(e) => onChange({ ...value, season: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Parte</p>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={value.part}
                  onChange={(e) => onChange({ ...value, part: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Stagione divisa in più parti (es. &ldquo;War of Underworld&rdquo; 1 e 2)? Imposta la
              stessa stagione e cartella madre, poi Parte 1 e Parte 2: la numerazione degli episodi
              sarà continua.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Serie madre (cartella)</p>
            {value.parentId ? (
              <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{value.parentTitle}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => onChange({ ...value, parentId: null, parentTitle: '' })}
                >
                  Rimuovi
                </Button>
              </div>
            ) : (
              <>
                <Input
                  placeholder="Cerca la serie principale (min. 2 caratteri)…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {searchQuery.isFetching ? (
                  <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Cerco…
                  </div>
                ) : null}
                {search.trim().length >= 2 && searchQuery.data ? (
                  <ul className="max-h-44 divide-y overflow-y-auto rounded-md border text-sm">
                    {searchQuery.data.data.slice(0, 8).map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 p-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                          onClick={() => {
                            onChange({
                              ...value,
                              parentId: a.id,
                              parentTitle: a.titleIta ?? a.title,
                            });
                            setSearch('');
                          }}
                        >
                          {a.titleIta ?? a.title}
                        </button>
                      </li>
                    ))}
                    {searchQuery.data.data.length === 0 ? (
                      <li className="p-2 text-xs text-muted-foreground">Nessun risultato.</li>
                    ) : null}
                  </ul>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Lascia vuoto per tenere questo titolo come cartella a sé.
                </p>
              </>
            )}
          </div>
        </>
      ) : null}

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Verrà salvato in</p>
        <p className="w-full whitespace-pre-wrap break-all rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
          {preview.isFetching && !preview.data ? 'Calcolo…' : (preview.data?.path ?? '—')}
        </p>
      </div>
    </div>
  );
}
