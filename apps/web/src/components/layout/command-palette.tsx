'use client';

import { trpc } from '@/lib/trpc';
import {
  Calendar,
  Compass,
  Download,
  Film,
  HeartHandshake,
  Home,
  LayoutGrid,
  Library,
  Pause,
  Play,
  RefreshCw,
  Search,
  Settings,
  Stethoscope,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface Entry {
  id: string;
  label: string;
  sublabel?: string;
  icon: ReactNode;
  image?: string | null;
  onSelect: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const enabled = open && query.trim().length >= 2;
  const search = trpc.catalog.search.useQuery({ query, page: 1 }, { enabled });
  const paused = trpc.download.isPaused.useQuery(undefined, { enabled: open });

  const sync = trpc.catalog.sync.useMutation({
    onSuccess: () => toast.success('Sincronizzazione avviata'),
  });
  const pause = trpc.download.pauseQueue.useMutation({
    onSuccess: () => {
      toast.success('Coda in pausa');
      void utils.download.isPaused.invalidate();
    },
  });
  const resume = trpc.download.resumeQueue.useMutation({
    onSuccess: () => {
      toast.success('Coda ripresa');
      void utils.download.isPaused.invalidate();
    },
  });

  // ⌘/Ctrl+K apre/chiude la palette.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const close = () => {
    setOpen(false);
    setQuery('');
    setActive(0);
  };

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const isPaused = paused.data?.paused === true;
  const actions: Entry[] = [
    { id: 'home', label: 'Home', icon: <Home className="h-4 w-4" />, onSelect: () => go('/') },
    {
      id: 'catalog',
      label: 'Catalogo',
      icon: <Compass className="h-4 w-4" />,
      onSelect: () => go('/catalog'),
    },
    {
      id: 'follows',
      label: 'Seguiti',
      icon: <HeartHandshake className="h-4 w-4" />,
      onSelect: () => go('/follows'),
    },
    {
      id: 'library',
      label: 'Libreria',
      icon: <Library className="h-4 w-4" />,
      onSelect: () => go('/library'),
    },
    {
      id: 'downloads',
      label: 'Download',
      icon: <LayoutGrid className="h-4 w-4" />,
      onSelect: () => go('/downloads'),
    },
    {
      id: 'calendar',
      label: 'Calendario',
      icon: <Calendar className="h-4 w-4" />,
      onSelect: () => go('/calendar'),
    },
    {
      id: 'settings',
      label: 'Impostazioni',
      icon: <Settings className="h-4 w-4" />,
      onSelect: () => go('/settings'),
    },
    {
      id: 'diagnostics',
      label: 'Diagnostica',
      icon: <Stethoscope className="h-4 w-4" />,
      onSelect: () => go('/diagnostica'),
    },
    {
      id: 'sync',
      label: 'Sincronizza catalogo ora',
      icon: <RefreshCw className="h-4 w-4" />,
      onSelect: () => {
        sync.mutate();
        close();
      },
    },
    isPaused
      ? {
          id: 'resume',
          label: 'Riprendi la coda download',
          icon: <Play className="h-4 w-4" />,
          onSelect: () => {
            resume.mutate();
            close();
          },
        }
      : {
          id: 'pause',
          label: 'Metti in pausa la coda download',
          icon: <Pause className="h-4 w-4" />,
          onSelect: () => {
            pause.mutate();
            close();
          },
        },
  ];

  const q = query.trim().toLowerCase();
  const searchEntries: Entry[] =
    q.length >= 2
      ? (search.data?.data ?? []).slice(0, 6).map((a) => ({
          id: a.id,
          label: a.titleIta ?? a.title,
          sublabel: a.titleIta && a.titleIta !== a.title ? a.title : undefined,
          icon: <Film className="h-4 w-4 text-muted-foreground" />,
          image: a.coverImage,
          onSelect: () => go(`/catalog/${a.slug}`),
        }))
      : [];
  const entries: Entry[] =
    q.length >= 2
      ? [...searchEntries, ...actions.filter((act) => act.label.toLowerCase().includes(q))]
      : actions;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset al cambio query/apertura
  useEffect(() => {
    setActive(0);
  }, [query, open]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (entries.length ? (i + 1) % entries.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (entries.length ? (i - 1 + entries.length) % entries.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      entries[active]?.onSelect();
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Chiudi"
        className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
        onClick={close}
      />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border bg-popover shadow-2xl">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Cerca anime o un'azione…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            ESC
          </kbd>
        </div>

        <ul className="max-h-[50vh] overflow-auto p-1.5">
          {entries.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              {enabled && search.isFetching ? 'Cerco…' : 'Nessun risultato.'}
            </li>
          ) : (
            entries.map((entry, idx) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => entry.onSelect()}
                  className={`flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors ${
                    idx === active ? 'bg-accent' : 'hover:bg-accent/60'
                  }`}
                >
                  {entry.image !== undefined ? (
                    <span className="relative aspect-[2/3] h-10 shrink-0 overflow-hidden rounded bg-muted">
                      {entry.image ? (
                        <img
                          src={entry.image}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center">
                          <Film className="h-4 w-4 text-muted-foreground" />
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                      {entry.icon}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="line-clamp-1 text-sm font-medium">{entry.label}</span>
                    {entry.sublabel ? (
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {entry.sublabel}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="flex items-center gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span>↑↓ naviga</span>
          <span>↵ apri</span>
          <span className="ml-auto flex items-center gap-1">
            <Download className="h-3 w-3" /> ⌘K
          </span>
        </div>
      </div>
    </div>
  );
}
