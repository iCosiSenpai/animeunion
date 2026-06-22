'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { trpc } from '@/lib/trpc';
import { cn, formatSpeed } from '@/lib/utils';
import { CheckCircle2, Download, Loader2, Pause, Play, Trash2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

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
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const queue = trpc.download.queue.useQuery(undefined, {
    refetchInterval: 1500,
  });
  const pausedQuery = trpc.download.isPaused.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const pauseMutation = trpc.download.pauseQueue.useMutation({
    onSuccess: () => {
      toast.success('Coda in pausa');
      void utils.download.isPaused.invalidate();
    },
  });

  const resumeMutation = trpc.download.resumeQueue.useMutation({
    onSuccess: () => {
      toast.success('Coda ripresa');
      void utils.download.isPaused.invalidate();
      void utils.download.queue.invalidate();
    },
  });

  const clearMutation = trpc.download.clearCompleted.useMutation({
    onSuccess: (res) => {
      toast.success(`Rimossi ${res.removed} job dalla coda`);
      void utils.download.queue.invalidate();
    },
  });

  const items = queue.data ?? [];
  const total = items.filter(
    (item) =>
      item.status === 'queued' ||
      item.status === 'downloading' ||
      item.status === 'processing' ||
      item.status === 'failed',
  ).length;
  // Prima il file in corso (downloading/processing), poi i queued in ordine di richiesta.
  const activeRank = (status: string): number =>
    status === 'downloading' || status === 'processing' ? 0 : 1;
  const active = items
    .filter(
      (item) =>
        item.status === 'queued' || item.status === 'downloading' || item.status === 'processing',
    )
    .sort((a, b) => activeRank(a.status) - activeRank(b.status));
  const completed = items.filter((item) => item.status === 'completed').slice(0, 5);
  const hasError = items.some((item) => item.status === 'failed');
  const isPaused = pausedQuery.data?.paused ?? false;

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Coda download</h3>
            {isPaused ? (
              <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Pausa
              </span>
            ) : null}
          </div>
          {queue.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        <ScrollArea viewportClassName="max-h-80">
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
                  <p className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {item.status === 'queued'
                        ? 'In attesa'
                        : item.status === 'downloading'
                          ? 'In download'
                          : 'In elaborazione'}
                    </span>
                    {item.status === 'downloading' && item.speedBps ? (
                      <span className="tabular-nums">{formatSpeed(item.speedBps)}</span>
                    ) : null}
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

        <div className="space-y-2 border-t px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            {isPaused ? (
              <Button
                variant="outline"
                size="sm"
                className="col-span-1 gap-1"
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
              >
                <Play className="h-4 w-4" />
                Riprendi
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="col-span-1 gap-1"
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending || active.length === 0}
              >
                <Pause className="h-4 w-4" />
                Pausa
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="col-span-1 gap-1"
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending || completed.length === 0}
            >
              <Trash2 className="h-4 w-4" />
              Pulisci
            </Button>
          </div>
          <Button asChild variant="outline" className="w-full">
            <Link href="/downloads" onClick={() => setOpen(false)}>
              Vai alla coda completa
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
