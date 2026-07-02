'use client';

import { useCommandPalette } from '@/lib/command-palette-store';
import { trpc } from '@/lib/trpc';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useShortcutLabel } from '@/lib/use-shortcut-label';
import {
  BarChart3,
  Bell,
  Calendar,
  CalendarClock,
  Compass,
  Crown,
  Database,
  Download,
  Film,
  FolderCog,
  FolderDown,
  HeartHandshake,
  Home,
  Info,
  Languages,
  LayoutGrid,
  Library,
  Palette,
  Pause,
  Play,
  RefreshCw,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Stethoscope,
  Webhook,
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
  const open = useCommandPalette((s) => s.open);
  const setOpen = useCommandPalette((s) => s.setOpen);
  const toggle = useCommandPalette((s) => s.toggle);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const shortcut = useShortcutLabel('K');

  // Debounce della query verso il backend: l'input resta istantaneo, ma la ricerca anime parte
  // solo dopo ~220ms di pausa (niente una richiesta per ogni tasto premuto).
  const debouncedQuery = useDebouncedValue(query, 220);
  const enabled = open && debouncedQuery.trim().length >= 2;
  const search = trpc.catalog.search.useQuery({ query: debouncedQuery, page: 1 }, { enabled });
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
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

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
      id: 'stats',
      label: 'Statistiche',
      icon: <BarChart3 className="h-4 w-4" />,
      onSelect: () => go('/statistiche'),
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

  // Destinazioni/azioni in-app cercabili (non mostrate di default per non affollare la palette):
  // gestore file, about e le singole sezioni delle Impostazioni via deep-link `?section=`.
  const extraActions: Entry[] = [
    {
      id: 'file-manager',
      label: 'Gestore file',
      icon: <FolderCog className="h-4 w-4" />,
      onSelect: () => go('/library/files'),
    },
    {
      id: 'about',
      label: 'Informazioni',
      icon: <Info className="h-4 w-4" />,
      onSelect: () => go('/about'),
    },
    {
      id: 'settings-download',
      label: 'Impostazioni: Download',
      icon: <FolderDown className="h-4 w-4" />,
      onSelect: () => go('/settings?section=download'),
    },
    {
      id: 'settings-pianificazione',
      label: 'Impostazioni: Pianificazione',
      icon: <CalendarClock className="h-4 w-4" />,
      onSelect: () => go('/settings?section=pianificazione'),
    },
    {
      id: 'settings-catalogo',
      label: 'Impostazioni: Catalogo',
      icon: <Compass className="h-4 w-4" />,
      onSelect: () => go('/settings?section=catalogo'),
    },
    {
      id: 'settings-lingua',
      label: 'Impostazioni: Lingua',
      icon: <Languages className="h-4 w-4" />,
      onSelect: () => go('/settings?section=lingua'),
    },
    {
      id: 'settings-notifiche',
      label: 'Impostazioni: Notifiche',
      icon: <Bell className="h-4 w-4" />,
      onSelect: () => go('/settings?section=notifiche'),
    },
    {
      id: 'settings-aspetto',
      label: 'Impostazioni: Aspetto e tema',
      icon: <Palette className="h-4 w-4" />,
      onSelect: () => go('/settings?section=aspetto'),
    },
    {
      id: 'settings-home',
      label: 'Impostazioni: Home (personalizza sezioni)',
      icon: <LayoutGrid className="h-4 w-4" />,
      onSelect: () => go('/settings?section=home'),
    },
    {
      id: 'settings-sicurezza',
      label: 'Impostazioni: Sicurezza',
      icon: <Shield className="h-4 w-4" />,
      onSelect: () => go('/settings?section=sicurezza'),
    },
    {
      id: 'settings-integrazioni',
      label: 'Impostazioni: Integrazioni',
      icon: <Webhook className="h-4 w-4" />,
      onSelect: () => go('/settings?section=integrazioni'),
    },
    {
      id: 'settings-backup',
      label: 'Impostazioni: Backup',
      icon: <Database className="h-4 w-4" />,
      onSelect: () => go('/settings?section=backup'),
    },
    {
      id: 'settings-premium',
      label: 'Impostazioni: Premium',
      icon: <Crown className="h-4 w-4" />,
      onSelect: () => go('/settings?section=premium'),
    },
    {
      id: 'settings-avanzate',
      label: 'Impostazioni: Avanzate',
      icon: <SlidersHorizontal className="h-4 w-4" />,
      onSelect: () => go('/settings?section=avanzate'),
    },
  ];

  const q = query.trim().toLowerCase();
  const trimmedQuery = query.trim();
  // Sempre per prima quando c'è una query: Invio apre la pagina risultati completa (riusa /catalog).
  const searchAllEntry: Entry = {
    id: '__search_all__',
    label: `Cerca "${trimmedQuery}" nel catalogo`,
    sublabel: 'Apri tutti i risultati con i filtri',
    icon: <Search className="h-4 w-4" />,
    onSelect: () => go(`/catalog?q=${encodeURIComponent(trimmedQuery)}`),
  };
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
      ? [
          searchAllEntry,
          ...searchEntries,
          ...[...actions, ...extraActions].filter((act) => act.label.toLowerCase().includes(q)),
        ]
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
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] sm:pt-[12vh]">
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
            <Download className="h-3 w-3" /> {shortcut}
          </span>
        </div>
      </div>
    </div>
  );
}
