'use client';

import { useAnimationsOn } from '@/components/layout/animation-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { trpc } from '@/lib/trpc';
import { useDownloadSummary } from '@/lib/use-download-summary';
import type { DownloadFilter, DownloadGroupSummary } from '@animeunion/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Download, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DownloadGroupCard } from './download-group-card';

const FILTERS: { key: DownloadFilter; label: string }[] = [
  { key: 'all', label: 'Tutti' },
  { key: 'active', label: 'In corso' },
  { key: 'completed', label: 'Completati' },
  { key: 'failed', label: 'Errori' },
];

function groupMatchesFilter(group: DownloadGroupSummary, filter: DownloadFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return group.queued + group.downloading + group.processing > 0;
  if (filter === 'completed') return group.completed > 0;
  return group.failed + group.cancelled > 0;
}

export function DownloadsView() {
  const utils = trpc.useUtils();
  const animationsOn = useAnimationsOn();
  const [filter, setFilter] = useState<DownloadFilter>('all');

  const { query: summaryQuery, counts, activeCount, hasFailed } = useDownloadSummary();

  const pausedQuery = trpc.download.isPaused.useQuery();

  // Cancel/retry/priorità toccano sia il riassunto sia le righe espanse.
  const invalidate = () => {
    void utils.download.summary.invalidate();
    void utils.download.groupItems.invalidate();
  };
  const cancelMutation = trpc.download.cancel.useMutation({ onSuccess: invalidate });
  const retryMutation = trpc.download.retry.useMutation({ onSuccess: invalidate });
  const priorityMutation = trpc.download.setPriority.useMutation({
    onSuccess: () => {
      toast.success('Spostato in cima alla coda');
      invalidate();
    },
  });
  const cancelGroupMutation = trpc.download.cancelGroup.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.cancelled} download annullati`);
      invalidate();
    },
  });
  const retryGroupMutation = trpc.download.retryGroup.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.retried} download rimessi in coda`);
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

  const summary = summaryQuery.data;
  const completedCount = counts?.completed ?? 0;
  const totalCount = counts?.all ?? 0;
  const isPaused = pausedQuery.data?.paused === true;
  const isWorking =
    clearMutation.isPending ||
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    cancelAllMutation.isPending ||
    retryAllMutation.isPending;

  const filterCounts: Record<DownloadFilter, number> = {
    all: totalCount,
    active: activeCount,
    completed: completedCount,
    failed: (counts?.failed ?? 0) + (counts?.cancelled ?? 0),
  };

  const groups = (summary?.groups ?? []).filter((g) => groupMatchesFilter(g, filter));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary/80">
            Attività
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Download</h1>
          <p className="text-sm text-muted-foreground">
            Un riquadro per anime: avanzamento, velocità ed episodi raggruppati.
          </p>
        </div>

        {totalCount > 0 ? (
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
            {activeCount > 0 ? (
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
            {completedCount > 0 ? (
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

      {isPaused && totalCount > 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600">
          <Pause className="h-4 w-4" />
          Coda in pausa: i download attivi finiranno, ma non partiranno nuovi job.
        </div>
      ) : null}

      {totalCount > 0 ? (
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
                {filterCounts[f.key]}
              </span>
            </Button>
          ))}
        </div>
      ) : null}

      {summaryQuery.isLoading ? (
        <div className="space-y-4">
          {['s-1', 's-2', 's-3'].map((key) => (
            <Card key={key} className="h-28 animate-pulse bg-muted" />
          ))}
        </div>
      ) : totalCount === 0 ? (
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
        <ScrollArea className="h-[calc(100dvh-16rem)]">
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
                    filter={filter}
                    onCancel={(id) => cancelMutation.mutate({ queueId: id })}
                    onRetry={(id) => retryMutation.mutate({ queueId: id })}
                    onPrioritize={(id) => priorityMutation.mutate({ queueId: id, priority: 100 })}
                    onCancelGroup={(animeId) => cancelGroupMutation.mutate({ animeId })}
                    onRetryGroup={(animeId) => retryGroupMutation.mutate({ animeId })}
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
