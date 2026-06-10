'use client';

import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export function SearchBar() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const enabled = query.trim().length >= 2;
  const search = trpc.catalog.search.useQuery({ query, page: 1 }, { enabled });
  const results = search.data?.data ?? [];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function goTo(slug: string) {
    router.push(`/catalog/${slug}`);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="relative w-full">
      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Cerca... (Ctrl+K)"
        className="pl-8"
      />
      {open && enabled && results.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-80 w-full overflow-auto rounded-md border bg-popover shadow-md">
          {results.slice(0, 8).map((anime) => (
            <button
              key={anime.id}
              type="button"
              onMouseDown={() => goTo(anime.slug)}
              className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-accent"
            >
              {anime.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
