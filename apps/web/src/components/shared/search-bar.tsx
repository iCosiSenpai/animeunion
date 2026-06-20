'use client';

import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';
import type { AnimeType } from '@animeunion/shared';
import { Film, Loader2, Search, Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type KeyboardEvent, useRef, useState } from 'react';

const TYPE_LABELS: Record<AnimeType, string> = {
  TV: 'Serie TV',
  TV_SHORT: 'Serie TV',
  MOVIE: 'Film',
  OVA: 'OVA',
  ONA: 'ONA',
  SPECIAL: 'Special',
  MUSIC: 'Music',
};

export function SearchBar() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const enabled = query.trim().length >= 2;
  const search = trpc.catalog.search.useQuery({ query, page: 1 }, { enabled });
  const results = (search.data?.data ?? []).slice(0, 8);

  function goTo(slug: string) {
    router.push(`/catalog/${slug}`);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || results.length === 0) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      const target = results[active];
      if (target) {
        event.preventDefault();
        goTo(target.slug);
      }
    }
  }

  return (
    <div className="relative w-full">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder="Cerca anime… (Ctrl K)"
        className="h-10 rounded-lg pl-9"
      />

      {open && enabled ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border bg-popover/95 shadow-xl backdrop-blur">
          {search.isFetching && results.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cerco…
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Nessun risultato per “{query.trim()}”.
            </div>
          ) : (
            <ul className="max-h-[26rem] overflow-auto p-1.5">
              {results.map((anime, idx) => {
                const title = anime.titleIta ?? anime.title;
                const hasOriginal = anime.titleIta && anime.titleIta !== anime.title;
                const meta = [TYPE_LABELS[anime.type], anime.seasonYear]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li key={anime.id}>
                    <button
                      type="button"
                      onMouseDown={() => goTo(anime.slug)}
                      onMouseEnter={() => setActive(idx)}
                      className={`flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors ${
                        idx === active ? 'bg-accent' : 'hover:bg-accent/60'
                      }`}
                    >
                      <span className="relative aspect-[2/3] h-14 shrink-0 overflow-hidden rounded-md bg-muted">
                        {anime.coverImage ? (
                          <img
                            src={anime.coverImage}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center">
                            <Film className="h-5 w-5 text-muted-foreground" />
                          </span>
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="line-clamp-1 text-sm font-medium">{title}</span>
                        {hasOriginal ? (
                          <span className="line-clamp-1 text-xs text-muted-foreground">
                            {anime.title}
                          </span>
                        ) : null}
                        {meta ? (
                          <span className="mt-0.5 text-xs text-muted-foreground">{meta}</span>
                        ) : null}
                      </span>
                      {anime.score != null ? (
                        <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
                          <Star className="h-3 w-3" />
                          {(anime.score / 10).toFixed(1)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
