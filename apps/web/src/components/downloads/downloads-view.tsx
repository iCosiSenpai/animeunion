'use client';

import { useAnimationsOn } from '@/components/layout/animation-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { trpc } from '@/lib/trpc';
import type { DownloadQueueItem } from '@animeunion/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Download, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DownloadGroupCard, groupQueue } from './download-group-card';

type Filter = 'all' | 'active' | 'completed' | 'failed';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tutti' },
  { key: 'active', label: 'In corso' },
  { key: 'completed', label: 'Completati' },
  { key: 'failed', label: 'Errori' },
];

const ACTIVE_STATES: DownloadQueueItem['status'][] = ['queued', 'downloading', 'processing'];

function matchesFilter(item: DownloadQueueItem, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return ACTIVE_STATES.includes(item.status);
  if (filter === 'completed') return item.status === 'completed';
  return item.status === 'failed' || item.status === 'cancelled';
}

export function DownloadsView() {
  const utils = trpc.useUtils();
  const animationsOn = useAnimationsOn();
  const [filter, setFilter] = useState<Filter>('all');

  const queueQuery = trpc.download.queue.useQuery(undefined, {
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 5000;
      const active = data.some((i) => ACTIVE_STATES.includes(i.status));
      return active ? 1500 : 5000;
    },
  });

  const pausedQuery = trpc.download.isPaused.useQuery();

  const invalidate = () => void utils.download.queue.invalidate();
  const cancelMutation = trpc.download.cancel.useMutation({ onSuccess: invalidate });
  const retryMutation = trpc.download.retry.useMutation({ onSuccess: invalidate });
  const priorityMutation = trpc.download.setPriority.useMutation({
    onSuccess: () => {
      toast.success('Spostato in cima alla coda');
      invalidate();
    },
  });

  const clearMutation = trpc.download.clearCompleted.useMutation({
    onSuccess: (res) => {
      toast.success(`Rimossi ${res.removed} job dalla coda`);
      invalidate();
    },
  });
  const pauseMutation = trpc.download.pauseQueue.useMutation({
    onSuccess: () => {
      toast.success('Coda in pausa');
      void utils.download.isPaused.invalidate();
      invalidate();
    },
  });
  const resumeMutation = trpc.download.resumeQueue.useMutation({
    onSuccess: () => {
      toast.success('Coda ripresa');
      void utils.download.isPaused.invalidate();
      invalidate();
    },
  });
  const cancelAllMutation = trpc.download.cancelAll.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.cancelled} download annullati`);
      invalidate();
    },
  });
  const retryAllMutation = trpc.download.retryAllFailed.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.retried} download rimessi in coda`);
      invalidate();
    },
  });

  const queue = queueQuery.data ?? [];
  const active = queue.filter((i) => ACTIVE_STATES.includes(i.status));
  const completed = queue.filter((i) => i.status === 'completed');
  const hasFailed = queue.some((i) => i.status === 'failed');
  const isPaused = pausedQuery.data?.paused === true;
  const isWorking =
    clearMutation.isPending ||
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    cancelAllMutation.isPending ||
    retryAllMutation.isPending;

  const counts: Record<Filter, number> = {
    all: queue.length,
    active: active.length,
    completed: completed.length,
    failed: queue.filter((i) => i.status === 'failed' || i.status === 'cancelled').length,
  };

  const groups = groupQueue(queue.filter((i) => matchesFilter(i, filter)));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Download</h1>
          <p className="text-sm text-muted-foreground">
            Un riquadro per anime: avanzamento, velocità ed episodi raggruppati.
          </p>
        </div>

        {queue.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {isPaused ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending || isWorking}
                className="gap-1"
              >
                <Play className="h-4 w-4" />
                Riprendi
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending || isWorking}
                className="gap-1"
              >
                <Pause className="h-4 w-4" />
                Pausa
              </Button>
            )}
            {active.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => cancelAllMutation.mutate()}
                disabled={cancelAllMutation.isPending || isWorking}
                className="gap-1"
              >
                <AlertCircle className="h-4 w-4" />
                Annulla tutti
              </Button>
            ) : null}
            {hasFailed ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => retryAllMutation.mutate()}
                disabled={retryAllMutation.isPending || isWorking}
                className="gap-1"
              >
                <RefreshCw className="h-4 w-4" />
                Riprova falliti
              </Button>
            ) : null}
            {completed.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending || isWorking}
                className="gap-1"
              >
                <Trash2 className="h-4 w-4" />
                Pulisci completati
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      {isPaused && queue.length > 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600">
          <Pause className="h-4 w-4" />
          Coda in pausa: i download attivi finiranno, ma non partiranno nuovi job.
        </div>
      ) : null}

      {queue.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? 'default' : 'outline'}
              onClick={() => setFilter(f.key)}
              className="gap-1.5"
            >
              {f.label}
              <span className="rounded-full bg-background/20 px-1.5 text-xs tabular-nums">
                {counts[f.key]}
              </span>
            </Button>
          ))}
        </div>
      ) : null}

      {queueQuery.isLoading ? (
        <div className="space-y-4">
          {['s-1', 's-2', 's-3'].map((key) => (
            <Card key={key} className="h-28 animate-pulse bg-muted" />
          ))}
        </div>
      ) : queue.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Download className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">Nessun download in coda</p>
            <p className="text-sm text-muted-foreground">
              Vai su un anime e premi Scarica dalla sezione episodi.
            </p>
          </div>
        </Card>
      ) : groups.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nessun download in questa categoria.
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-16rem)]">
          <div className="space-y-3 pr-3">
            <AnimatePresence initial={false}>
              {groups.map((group) => (
                <motion.div
                  key={group.animeId}
                  initial={animationsOn ? { opacity: 0, y: 8 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={animationsOn ? { opacity: 0 } : undefined}
                  transition={{ duration: 0.18 }}
                >
                  <DownloadGroupCard
                    group={group}
                    onCancel={(id) => cancelMutation.mutate({ queueId: id })}
                    onRetry={(id) => retryMutation.mutate({ queueId: id })}
                    onPrioritize={(id) => priorityMutation.mutate({ queueId: id, priority: 100 })}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
