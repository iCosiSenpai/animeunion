'use client';

import { AnimeGrid, AnimeGridSkeleton } from '@/components/anime/anime-grid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import type { AnimeStatus, AnimeType, Language, Season } from '@animeunion/shared';
import { X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

const SEASONS: { value: Season; label: string }[] = [
  { value: 'WINTER', label: 'Inverno' },
  { value: 'SPRING', label: 'Primavera' },
  { value: 'SUMMER', label: 'Estate' },
  { value: 'FALL', label: 'Autunno' },
];

const TYPES: { value: AnimeType; label: string }[] = [
  { value: 'TV', label: 'TV' },
  { value: 'TV_SHORT', label: 'TV Short' },
  { value: 'MOVIE', label: 'Film' },
  { value: 'OVA', label: 'OVA' },
  { value: 'ONA', label: 'ONA' },
  { value: 'SPECIAL', label: 'Special' },
  { value: 'MUSIC', label: 'Music' },
];

const STATUSES: { value: AnimeStatus; label: string }[] = [
  { value: 'ONGOING', label: 'In corso' },
  { value: 'COMPLETED', label: 'Completato' },
  { value: 'UPCOMING', label: 'In arrivo' },
];

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'SUB_ITA', label: 'Sub ITA' },
  { value: 'DUB_ITA', label: 'Dub ITA' },
];

const SORTS: { value: 'recent' | 'score' | 'title'; label: string }[] = [
  { value: 'recent', label: 'Più recenti' },
  { value: 'score', label: 'Più votati' },
  { value: 'title', label: 'Titolo A-Z' },
];

const ALL = '__all__';

export function CatalogBrowser() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get('q') ?? '';
  const genre = searchParams.get('genre') ?? '';
  const type = searchParams.get('type') ?? '';
  const status = searchParams.get('status') ?? '';
  const year = searchParams.get('year') ?? '';
  const season = searchParams.get('season') ?? '';
  const language = searchParams.get('language') ?? '';
  const sort = searchParams.get('sort') ?? 'recent';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));

  const [queryInput, setQueryInput] = useState(q);
  useEffect(() => setQueryInput(q), [q]);

  function pushParams(updates: Record<string, string | null>, resetPage = true): void {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    if (resetPage) {
      params.delete('page');
    }
    router.push(`/catalog?${params.toString()}`);
  }

  function onSearchSubmit(event: FormEvent): void {
    event.preventDefault();
    pushParams({ q: queryInput });
  }

  function onReset(): void {
    router.push('/catalog');
  }

  const filtersQuery = trpc.catalog.filters.useQuery();
  const browseQuery = trpc.catalog.browse.useQuery({
    query: q,
    page,
    genre: genre || undefined,
    type: (type as AnimeType) || undefined,
    status: (status as AnimeStatus) || undefined,
    year: year ? Number(year) : undefined,
    season: (season as Season) || undefined,
    language: (language as Language) || undefined,
    sort: (sort as 'recent' | 'score' | 'title') || 'recent',
  });

  const items = browseQuery.data?.data ?? [];
  const hasMore = browseQuery.data?.meta.hasMore ?? false;
  const total = browseQuery.data?.meta.total ?? 0;

  const activeFilters = useMemo(
    () =>
      [
        q ? { key: 'q', label: `“${q}”` } : null,
        genre ? { key: 'genre', label: `Genere: ${genre}` } : null,
        type
          ? { key: 'type', label: `Tipo: ${TYPES.find((t) => t.value === type)?.label ?? type}` }
          : null,
        status
          ? {
              key: 'status',
              label: `Stato: ${STATUSES.find((s) => s.value === status)?.label ?? status}`,
            }
          : null,
        year ? { key: 'year', label: `Anno: ${year}` } : null,
        season
          ? {
              key: 'season',
              label: `Stagione: ${SEASONS.find((s) => s.value === season)?.label ?? season}`,
            }
          : null,
        language
          ? {
              key: 'language',
              label: `Lingua: ${LANGUAGES.find((l) => l.value === language)?.label ?? language}`,
            }
          : null,
        sort !== 'recent'
          ? {
              key: 'sort',
              label: `Ordine: ${SORTS.find((s) => s.value === sort)?.label ?? sort}`,
            }
          : null,
      ].filter((f): f is { key: string; label: string } => f !== null),
    [q, genre, type, status, year, season, language, sort],
  );

  const years = useMemo(() => filtersQuery.data?.years ?? [], [filtersQuery.data]);
  const genres = useMemo(() => filtersQuery.data?.genres ?? [], [filtersQuery.data]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Catalogo</h1>
        <p className="text-sm text-muted-foreground">Esplora e filtra gli anime di AnimeUnion.</p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm">
        <form onSubmit={onSearchSubmit} className="flex gap-2">
          <Input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="Cerca per titolo..."
            className="flex-1"
          />
          <Button type="submit" variant="secondary">
            Cerca
          </Button>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            value={genre || ALL}
            onValueChange={(value) => pushParams({ genre: value === ALL ? null : value })}
            disabled={filtersQuery.isLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder="Genere" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tutti i generi</SelectItem>
              {genres.map((g) => (
                <SelectItem key={g.slug} value={g.slug}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={type || ALL}
            onValueChange={(value) => pushParams({ type: value === ALL ? null : value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tutti i tipi</SelectItem>
              {TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={status || ALL}
            onValueChange={(value) => pushParams({ status: value === ALL ? null : value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tutti gli stati</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={year || ALL}
            onValueChange={(value) => pushParams({ year: value === ALL ? null : value })}
            disabled={filtersQuery.isLoading || years.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="Anno" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tutti gli anni</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={season || ALL}
            onValueChange={(value) => pushParams({ season: value === ALL ? null : value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Stagione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tutte le stagioni</SelectItem>
              {SEASONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={language || ALL}
            onValueChange={(value) => pushParams({ language: value === ALL ? null : value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Lingua" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tutte le lingue</SelectItem>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort || 'recent'} onValueChange={(value) => pushParams({ sort: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Ordina per" />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {activeFilters.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Filtri attivi:</span>
            {activeFilters.map((filter) => (
              <Badge key={filter.key} variant="secondary" className="gap-1">
                {filter.label}
                <button
                  type="button"
                  onClick={() => pushParams({ [filter.key]: null })}
                  aria-label={`Rimuovi ${filter.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <Button variant="ghost" size="sm" onClick={onReset} className="gap-1">
              <X className="h-4 w-4" />
              Azzera tutto
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {browseQuery.isLoading && items.length === 0
            ? 'Caricamento...'
            : `${total} risultat${total === 1 ? 'o' : 'i'}`}
        </span>
      </div>

      {browseQuery.isLoading && items.length === 0 ? (
        <AnimeGridSkeleton />
      ) : items.length === 0 ? (
        <div className="py-24 text-center text-muted-foreground">Nessun anime trovato.</div>
      ) : (
        <AnimeGrid anime={items} />
      )}

      {items.length > 0 ? (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => pushParams({ page: String(page - 1) }, false)}
          >
            Precedente
          </Button>
          <span className="text-sm text-muted-foreground">Pagina {page}</span>
          <Button
            variant="outline"
            disabled={!hasMore}
            onClick={() => pushParams({ page: String(page + 1) }, false)}
          >
            Successiva
          </Button>
        </div>
      ) : null}
    </div>
  );
}
