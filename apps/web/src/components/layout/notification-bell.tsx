'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { trpc } from '@/lib/trpc';
import { cn, formatDate } from '@/lib/utils';
import type { Notification, NotificationType } from '@animeunion/shared';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Film,
  HardDrive,
  Info,
  RefreshCw,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';

const ICONS: Record<NotificationType, ReactNode> = {
  download_complete: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  download_failed: <XCircle className="h-4 w-4 text-destructive" />,
  new_episode: <Film className="h-4 w-4 text-primary" />,
  season_available: <Sparkles className="h-4 w-4 text-primary" />,
  sync_complete: <RefreshCw className="h-4 w-4 text-muted-foreground" />,
  disk_low: <HardDrive className="h-4 w-4 text-amber-500" />,
  info: <Info className="h-4 w-4 text-muted-foreground" />,
};

type FilterKey = 'all' | 'download' | 'episode' | 'system';

const CATEGORY: Record<NotificationType, Exclude<FilterKey, 'all'>> = {
  download_complete: 'download',
  download_failed: 'download',
  new_episode: 'episode',
  season_available: 'episode',
  sync_complete: 'system',
  disk_low: 'system',
  info: 'system',
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tutte' },
  { key: 'download', label: 'Download' },
  { key: 'episode', label: 'Episodi' },
  { key: 'system', label: 'Sistema' },
];

// Destinazione del click: scheda anime se disponibile, altrimenti pagine di sistema.
function destinationOf(n: Notification): string | null {
  if (n.type === 'disk_low' || n.type === 'sync_complete') {
    return '/diagnostica';
  }
  if (n.animeSlug) {
    return `/catalog/${n.animeSlug}`;
  }
  if (n.type === 'download_complete' || n.type === 'download_failed') {
    return '/downloads';
  }
  return null;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayBucket(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) {
    return 'Oggi';
  }
  if (sameDay(d, yesterday)) {
    return 'Ieri';
  }
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Raggruppa per giorno preservando l'ordine (la lista arriva già desc per data).
function groupByDay(items: Notification[]): { label: string; items: Notification[] }[] {
  const groups: { label: string; items: Notification[] }[] = [];
  for (const item of items) {
    const label = dayBucket(item.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }
  return groups;
}

export function NotificationBell() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  const unread = trpc.notifications.unreadCount.useQuery(undefined, { refetchInterval: 20000 });
  const list = trpc.notifications.list.useQuery(undefined, { refetchInterval: 20000 });

  const refresh = () => {
    void utils.notifications.list.invalidate();
    void utils.notifications.unreadCount.invalidate();
  };
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: refresh });
  const markAll = trpc.notifications.markAllRead.useMutation({ onSuccess: refresh });
  const clear = trpc.notifications.clear.useMutation({ onSuccess: refresh });

  const items = list.data ?? [];
  const count = unread.data?.count ?? 0;
  const filtered = filter === 'all' ? items : items.filter((n) => CATEGORY[n.type] === filter);
  const groups = groupByDay(filtered);

  const onItem = (n: Notification) => {
    if (!n.read) {
      markRead.mutate({ id: n.id });
    }
    const dest = destinationOf(n);
    setOpen(false);
    if (dest) {
      router.push(dest);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifiche"
          title="Notifiche"
          className="relative"
        >
          <Bell className={cn('h-5 w-5', count > 0 && 'text-primary')} />
          {count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold">Notifiche</h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Segna tutte lette"
              title="Segna tutte come lette"
              onClick={() => markAll.mutate()}
              disabled={count === 0}
            >
              <CheckCheck className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Pulisci lette"
              title="Rimuovi le lette"
              onClick={() => clear.mutate()}
              disabled={items.length === 0}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 border-b px-3 py-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs transition-colors',
                filter === f.key
                  ? 'bg-primary text-primary-foreground'
                  : 'border text-muted-foreground hover:bg-accent',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <ScrollArea className="max-h-96">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nessuna notifica.</p>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <p className="bg-muted/40 px-4 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
                <ul className="divide-y">
                  {group.items.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => onItem(n)}
                        className={cn(
                          'flex w-full gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-accent/60',
                          !n.read && 'bg-primary/5',
                        )}
                      >
                        <span className="mt-0.5 shrink-0">{ICONS[n.type]}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-snug">{n.title}</p>
                          {n.body ? (
                            <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                          ) : null}
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {formatDate(n.createdAt)}
                          </p>
                        </div>
                        {!n.read ? (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
