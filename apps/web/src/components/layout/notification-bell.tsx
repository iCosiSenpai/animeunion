'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { trpc } from '@/lib/trpc';
import { cn, formatDate } from '@/lib/utils';
import type { NotificationType } from '@animeunion/shared';
import { Bell, CheckCheck, CheckCircle2, Film, Info, Trash2, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

const ICONS: Record<NotificationType, ReactNode> = {
  download_complete: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  download_failed: <XCircle className="h-4 w-4 text-destructive" />,
  new_episode: <Film className="h-4 w-4 text-primary" />,
  info: <Info className="h-4 w-4 text-muted-foreground" />,
};

export function NotificationBell() {
  const utils = trpc.useUtils();
  const unread = trpc.notifications.unreadCount.useQuery(undefined, { refetchInterval: 20000 });
  const list = trpc.notifications.list.useQuery(undefined, { refetchInterval: 20000 });

  const refresh = () => {
    void utils.notifications.list.invalidate();
    void utils.notifications.unreadCount.invalidate();
  };
  const markAll = trpc.notifications.markAllRead.useMutation({ onSuccess: refresh });
  const clear = trpc.notifications.clear.useMutation({ onSuccess: refresh });

  const items = list.data ?? [];
  const count = unread.data?.count ?? 0;

  return (
    <Popover
      onOpenChange={(open) => {
        // Apertura: segna come lette dopo un attimo (così il badge sparisce).
        if (open && count > 0) {
          setTimeout(() => markAll.mutate(), 1200);
        }
      }}
    >
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
              disabled={items.length === 0}
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

        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nessuna notifica.</p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={cn('flex gap-3 px-4 py-3 text-sm', !n.read && 'bg-primary/5')}
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
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
