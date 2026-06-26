'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { trpc } from '@/lib/trpc';
import { cn, formatSpeed } from '@/lib/utils';
import { CheckCircle2, Download, Loader2, Pause, Play, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

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
  const summary = trpc.download.summary.useQuery(undefined, {
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 5000;
      const active = data.counts.downloading + data.counts.processing > 0;
      return active ? 1500 : 5000;
    },
  });
  const pausedQuery = trpc.download.isPaused.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const invalidate = () => void utils.download.summary.invalidate();

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
      invalidate();
    },
  });

  const clearMutation = trpc.download.clearCompleted.useMutation({
    onSuccess: (res) => {
      toast.success(`Rimossi ${res.removed} job dalla coda`);
      invalidate();
    },
  });

  const counts = summary.data?.counts;
  // Item in volo (downloading/processing) da tutti i gruppi: bastano per la barra live.
  const inflight = (summary.data?.groups ?? []).flatMap((g) => g.activeItems);
  const queuedCount = counts?.queued ?? 0;
  const completedCount = counts?.completed ?? 0;
  const failedCount = counts?.failed ?? 0;
  const activeCount = counts ? counts.queued + counts.downloading + counts.processing : 0;
  // Badge: lavori non terminali + falliti (esclude i cancellati, come prima).
  const badge = activeCount + failedCount;
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
              badge > 0 && 'text-primary',
              failedCount > 0 && activeCount === 0 && 'text-destructive',
            )}
          />
          {badge > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {badge > 99 ? '99+' : badge}
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
          {summary.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        <ScrollArea viewportClassName="max-h-80">
          {inflight.length === 0 && queuedCount === 0 && completedCount === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Nessun download in coda.
            </p>
          ) : null}

          {inflight.length > 0 ? (
            <div className="space-y-3 p-4">
              {inflight.map((item) => (
                <div key={item.id} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="line-clamp-1 flex-1 text-sm">
                      {item.animeTitle} · E{item.episodeNumber}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(item.progress * 100)}%
                    </span>
                  </div>
                  <ProgressBar progress={item.progress} />
                  <p className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{item.status === 'downloading' ? 'In download' : 'In elaborazione'}</span>
                    {item.status === 'downloading' && item.speedBps ? (
                      <span className="tabular-nums">{formatSpeed(item.speedBps)}</span>
                    ) : null}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {queuedCount > 0 || completedCount > 0 ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-3 text-xs text-muted-foreground">
              {queuedCount > 0 ? (
                <span className="flex items-center gap-1">
                  <Download className="h-3.5 w-3.5" />
                  {queuedCount} in coda
                </span>
              ) : null}
              {completedCount > 0 ? (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  {completedCount} completati
                </span>
              ) : null}
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
                disabled={pauseMutation.isPending || activeCount === 0}
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
              disabled={clearMutation.isPending || completedCount === 0}
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
