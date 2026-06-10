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
import type { Season } from '@animeunion/shared';
import { X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

const SEASONS: { value: Season; label: string }[] = [
  { value: 'WINTER', label: 'Inverno' },
  { value: 'SPRING', label: 'Primavera' },
  { value: 'SUMMER', label: 'Estate' },
  { value: 'FALL', label: 'Autunno' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1989 }, (_, i) => String(CURRENT_YEAR - i));

const ALL = '__all__';

export function CatalogBrowser() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get('q') ?? '';
  const genre = searchParams.get('genre') ?? '';
  const year = searchParams.get('year') ?? '';
  const season = searchParams.get('season') ?? '';
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
    pushParams({ q: queryInput, genre: null, year: null, season: null });
  }

  const mode = genre ? 'genre' : season && year ? 'season' : year ? 'year' : 'search';

  const searchQuery = trpc.catalog.search.useQuery(
    { query: q, page },
    { enabled: mode === 'search' },
  );
  const genreQuery = trpc.catalog.byGenre.useQuery(
    { genreSlug: genre, page },
    { enabled: mode === 'genre' },
  );
  const seasonQuery = trpc.catalog.bySeason.useQuery(
    { season: season as Season, year: Number(year), page },
    { enabled: mode === 'season' },
  );
  const yearQuery = trpc.catalog.byYear.useQuery(
    { year: Number(year), page },
    { enabled: mode === 'year' },
  );

  const active =
    mode === 'genre'
      ? genreQuery
      : mode === 'season'
        ? seasonQuery
        : mode === 'year'
          ? yearQuery
          : searchQuery;

  const result = active.data;
  const items = result?.data ?? [];
  const hasMore = result?.meta.hasMore ?? false;
  const hasActiveFilters = Boolean(q || genre || year || season);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Catalogo</h1>
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={onSearchSubmit} className="w-full sm:w-56">
            <Input
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="Cerca per titolo..."
            />
          </form>
          <Select
            value={year || ALL}
            onValueChange={(value) =>
              pushParams({ year: value === ALL ? null : value, genre: null })
            }
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Anno" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tutti gli anni</SelectItem>
              {YEARS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={season || ALL}
            onValueChange={(value) =>
              pushParams({ season: value === ALL ? null : value, genre: null })
            }
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Stagione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tutte le stagioni</SelectItem>
              {SEASONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/catalog')}
              className="gap-1"
            >
              <X className="h-4 w-4" />
              Azzera
            </Button>
          ) : null}
        </div>
      </div>

      {genre ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Genere:</span>
          <Badge variant="secondary" className="gap-1">
            {genre}
            <button
              type="button"
              onClick={() => pushParams({ genre: null })}
              aria-label="Rimuovi genere"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        </div>
      ) : null}

      {season && !year ? (
        <p className="text-sm text-muted-foreground">
          Seleziona anche un anno per filtrare per stagione.
        </p>
      ) : null}

      {active.isFetching && items.length === 0 ? (
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
