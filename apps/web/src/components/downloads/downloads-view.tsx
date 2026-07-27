'use client';

import { StatCard } from '@/components/dashboard/stat-card';
import { StatusPill } from '@/components/dashboard/status-pill';
import type { StatusTone } from '@/components/dashboard/tone';
import { useAnimationsOn } from '@/components/layout/animation-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { QueryError } from '@/components/ui/query-error';
import { trpc } from '@/lib/trpc';
import { useDownloadSummary } from '@/lib/use-download-summary';
import { formatDuration, formatSpeed } from '@/lib/utils';
import type { DownloadFilter, DownloadGroupSummary } from '@animeunion/shared';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  Gauge,
  ListChecks,
  Pause,
  Play,
  RefreshCw,
  Timer,
  Trash2,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { DownloadGroupCard } from './download-group-card';

const FILTERS: { key: DownloadFilter; label: string }[] = [
  { key: 'all', label: 'Tutti' },
  { key: 'active', label: 'In corso' },
  { key: 'completed', label: 'Completati' },
  { key: 'failed', label: 'Errori' },
];

// Preset rapidi del limite di banda COMPLESSIVO (KB/s, 1 KB = 1024 B). 0 = illimitata. La versione
// "precisa" (valore libero in MB/s) vive nelle Impostazioni: qui è solo scelta veloce a un tap.
const SPEED_PRESETS: { kbps: number; label: string }[] = [
  { kbps: 0, label: 'Illimitata' },
  { kbps: 1024, label: '1 MB/s' },
  { kbps: 3072, label: '3 MB/s' },
  { kbps: 5120, label: '5 MB/s' },
  { kbps: 10240, label: '10 MB/s' },
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

  // Limite di velocità complessivo (config): lettura leggera + set rapido dai preset. Non è un
  // clone del form Impostazioni (che è a valore libero), qui è solo scelta veloce.
  const configQuery = trpc.config.getAll.useQuery(undefined, { staleTime: 60_000 });
  const speedLimitKbps = configQuery.data?.downloadSpeedLimitKbps ?? 0;
  const speedLimitBps = speedLimitKbps * 1024;
  const setLimitMutation = trpc.config.set.useMutation({
    onSuccess: () => {
      void utils.config.getAll.invalidate();
    },
  });
  const setSpeedLimit = (kbps: number) => {
    setLimitMutation.mutate({ key: 'downloadSpeedLimitKbps', value: kbps });
    toast.success(
      kbps > 0 ? `Limite di banda: ${formatSpeed(kbps * 1024)}` : 'Velocità di download illimitata',
    );
  };

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

  const downloading = (counts?.downloading ?? 0) + (counts?.processing ?? 0);
  const queuedCount = counts?.queued ?? 0;
  const failedCount = (counts?.failed ?? 0) + (counts?.cancelled ?? 0);
  let queueTone: StatusTone = 'neutral';
  let queueLabel = 'Ferma';
  if (isPaused) {
    queueTone = 'warning';
    queueLabel = 'In pausa';
  } else if (downloading > 0) {
    queueTone = 'info';
    queueLabel = 'In download';
  } else if (queuedCount > 0) {
    queueTone = 'primary';
    queueLabel = 'In coda';
  }

  const groups = (summary?.groups ?? []).filter((g) => groupMatchesFilter(g, filter));

  // Metriche live COMPLESSIVE (extra usabilità): velocità aggregata, ETA globale e avanzamento
  // dell'intera coda. Calcolate su tutti i gruppi (non filtrati) per riflettere lo stato reale.
  const activeItems = (summary?.groups ?? []).flatMap((g) => g.activeItems);
  const liveSpeed = activeItems.reduce(
    (sum, i) => sum + (i.status === 'downloading' ? (i.speedBps ?? 0) : 0),
    0,
  );
  const remainingBytes = activeItems.reduce(
    (sum, i) => sum + (i.totalBytes != null ? Math.max(0, i.totalBytes - i.bytesDownloaded) : 0),
    0,
  );
  const globalEta = liveSpeed > 0 && remainingBytes > 0 ? remainingBytes / liveSpeed : null;
  let overallDone = 0;
  let overallTotal = 0;
  for (const g of summary?.groups ?? []) {
    overallTotal += g.total;
    overallDone += g.completed + g.activeItems.reduce((sum, i) => sum + i.progress, 0);
  }
  const overallProgress = overallTotal > 0 ? Math.min(1, overallDone / overallTotal) : 0;
  const overallPct = Math.round(overallProgress * 100);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight">Download</h1>
          <StatusPill tone={queueTone} label={queueLabel} pulse={downloading > 0} />
        </div>

        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Gauge className="h-4 w-4" />
                <span className="tabular-nums">
                  {speedLimitKbps > 0 ? formatSpeed(speedLimitBps) : 'Illimitata'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Limite di velocità</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={String(speedLimitKbps)}
                onValueChange={(v) => setSpeedLimit(Number(v))}
              >
                {SPEED_PRESETS.map((p) => (
                  <DropdownMenuRadioItem key={p.kbps} value={String(p.kbps)}>
                    {p.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings?section=download">Impostazioni avanzate…</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {totalCount > 0 ? (
            <>
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
            </>
          ) : null}
        </div>
      </header>

      {totalCount > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="In download"
            value={downloading}
            icon={<Download className="h-5 w-5" />}
            tone={downloading > 0 ? 'info' : 'neutral'}
          />
          <StatCard
            label="In coda"
            value={queuedCount}
            icon={<ListChecks className="h-5 w-5" />}
            tone={queuedCount > 0 ? 'primary' : 'neutral'}
          />
          <StatCard
            label="Falliti"
            value={failedCount}
            icon={<AlertTriangle className="h-5 w-5" />}
            tone={failedCount > 0 ? 'danger' : 'neutral'}
          />
          <StatCard
            label="Completati"
            value={completedCount}
            icon={<CheckCircle2 className="h-5 w-5" />}
            tone={completedCount > 0 ? 'success' : 'neutral'}
          />
        </div>
      ) : null}

      {isPaused && totalCount > 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600">
          <Pause className="h-4 w-4" />
          Coda in pausa: i download attivi finiranno, ma non partiranno nuovi job.
        </div>
      ) : null}

      {activeCount > 0 ? (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 font-medium tabular-nums">
                <Zap className="h-4 w-4 text-info" />
                {liveSpeed > 0 ? formatSpeed(liveSpeed) : '—'}
                {speedLimitKbps > 0 ? (
                  <span className="font-normal text-muted-foreground">
                    / {formatSpeed(speedLimitBps)}
                  </span>
                ) : null}
              </span>
              {globalEta ? (
                <span className="flex items-center gap-1.5 tabular-nums text-muted-foreground">
                  <Timer className="h-4 w-4" />
                  {formatDuration(globalEta)}
                </span>
              ) : null}
            </div>
            <span className="tabular-nums text-muted-foreground">{overallPct}% completato</span>
          </div>
          <Progress
            value={overallProgress}
            label="Avanzamento complessivo dei download"
            className="h-2"
          />
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
      ) : summaryQuery.isError ? (
        <QueryError onRetry={() => summaryQuery.refetch()} title="Impossibile caricare la coda" />
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
        // Nessun contenitore a scroll dedicato: la lista scorre col resto della pagina (niente
        // "finestra" annidata, niente scrollbar custom che si scontra col testo su mobile, meno
        // jank/freeze su iOS Safari).
        <div className="space-y-3">
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
      )}
    </div>
  );
}
