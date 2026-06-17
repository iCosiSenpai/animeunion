'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { CheckCircle2, Download, Loader2, XCircle } from 'lucide-react';
import Link from 'next/link';

const STATUS_ICONS: Record<string, React.ReactNode> = {
  queued: <Download className="h-4 w-4 text-muted-foreground" />,
  downloading: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
  processing: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
  cancelled: <XCircle className="h-4 w-4 text-muted-foreground" />,
};

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${Math.round(progress * 100)}%` }}
      />
    </div>
  );
}

export function DownloadStatus() {
  const queue = trpc.download.queue.useQuery(undefined, {
    refetchInterval: 1500,
  });
  const items = queue.data ?? [];
  const total = items.filter(
    (item) =>
      item.status === 'queued' ||
      item.status === 'downloading' ||
      item.status === 'processing' ||
      item.status === 'failed',
  ).length;
  const active = items.filter(
    (item) =>
      item.status === 'queued' || item.status === 'downloading' || item.status === 'processing',
  );
  const completed = items.filter((item) => item.status === 'completed').slice(0, 5);

  const hasError = items.some((item) => item.status === 'failed');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Download"
          title="Download"
          className="relative"
        >
          <Download
            className={cn(
              'h-5 w-5',
              total > 0 && 'text-primary',
              hasError && total === 0 && 'text-destructive',
            )}
          />
          {total > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {total > 99 ? '99+' : total}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold">Coda download</h3>
          {queue.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        <ScrollArea className="max-h-80">
          {active.length === 0 && completed.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Nessun download in coda.
            </p>
          ) : null}

          {active.length > 0 ? (
            <div className="space-y-3 p-4">
              {active.map((item) => (
                <div key={item.id} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    {STATUS_ICONS[item.status]}
                    <span className="line-clamp-1 flex-1 text-sm">
                      {item.animeTitle} · E{item.episodeNumber}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(item.progress * 100)}%
                    </span>
                  </div>
                  <ProgressBar progress={item.progress} />
                  <p className="text-xs text-muted-foreground">
                    {item.status === 'queued'
                      ? 'In attesa'
                      : item.status === 'downloading'
                        ? 'In download'
                        : 'In elaborazione'}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {completed.length > 0 ? (
            <div className="border-t px-4 py-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Completati</p>
              <div className="space-y-2">
                {completed.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="line-clamp-1 text-sm">
                      {item.animeTitle} · E{item.episodeNumber}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </ScrollArea>

        <div className="border-t px-4 py-3">
          <Button asChild variant="outline" className="w-full">
            <Link href="/downloads">Vai alla coda completa</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
