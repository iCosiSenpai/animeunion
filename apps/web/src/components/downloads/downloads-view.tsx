'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import type { DownloadQueueItem, DownloadStatus, Language } from '@animeunion/shared';
import { Download, RefreshCw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const STATUS_LABELS: Record<DownloadStatus, string> = {
  queued: 'In coda',
  downloading: 'Download',
  processing: 'Finalizzazione',
  completed: 'Completato',
  failed: 'Fallito',
  cancelled: 'Annullato',
};

const STATUS_VARIANT: Record<DownloadStatus, 'default' | 'secondary' | 'destructive' | 'outline'> =
  {
    queued: 'outline',
    downloading: 'default',
    processing: 'default',
    completed: 'secondary',
    failed: 'destructive',
    cancelled: 'outline',
  };

const LANGUAGE_LABELS: Record<Language, string> = {
  SUB_ITA: 'SUB',
  DUB_ITA: 'DUB',
};

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function QueueRow({
  item,
  onCancel,
  onRetry,
}: {
  item: DownloadQueueItem;
  onCancel: (queueId: string) => void;
  onRetry: (queueId: string) => void;
}) {
  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.animeTitle}</p>
          <p className="text-xs text-muted-foreground">
            Ep {item.episodeNumber}
            {item.episodeTitle ? ` · ${item.episodeTitle}` : ''} · {LANGUAGE_LABELS[item.language]}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[item.status]}>{STATUS_LABELS[item.status]}</Badge>
        <div className="flex gap-1">
          {item.status === 'failed' ? (
            <Button size="sm" variant="ghost" onClick={() => onRetry(item.id)} className="gap-1">
              <RefreshCw className="h-3 w-3" />
              Riprova
            </Button>
          ) : null}
          {item.status === 'queued' || item.status === 'downloading' ? (
            <Button size="sm" variant="ghost" onClick={() => onCancel(item.id)} className="gap-1">
              <X className="h-3 w-3" />
              Annulla
            </Button>
          ) : null}
        </div>
      </div>
      {(item.status === 'downloading' || item.status === 'processing') && item.progress > 0 ? (
        <ProgressBar value={item.progress} />
      ) : null}
      {item.error ? <p className="text-xs text-destructive">{item.error}</p> : null}
    </div>
  );
}

export function DownloadsView() {
  // Polling 1.5s mentre ci sono job in volo, altrimenti 5s.
  const queueQuery = trpc.download.queue.useQuery(undefined, {
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 5000;
      const active = data.some(
        (i) => i.status === 'queued' || i.status === 'downloading' || i.status === 'processing',
      );
      return active ? 1500 : 5000;
    },
  });

  const utils = trpc.useUtils();
  const cancelMutation = trpc.download.cancel.useMutation({
    onSuccess: (res) => {
      if (res.cancelled) {
        toast.success('Download annullato');
        void utils.download.queue.invalidate();
      } else {
        toast.error('Impossibile annullare (gia concluso?)');
      }
    },
    onError: () => toast.error('Errore durante la cancellazione'),
  });

  const retryMutation = trpc.download.retry.useMutation({
    onSuccess: (res) => {
      if (res.retried) {
        toast.success('Download rimesso in coda');
        void utils.download.queue.invalidate();
      } else {
        toast.error('Impossibile riprovare (non in stato failed)');
      }
    },
    onError: () => toast.error('Errore durante il retry'),
  });

  const clearMutation = trpc.download.clearCompleted.useMutation({
    onSuccess: (res) => {
      toast.success(`Rimossi ${res.removed} job dalla coda`);
      void utils.download.queue.invalidate();
    },
  });

  const queue = queueQuery.data ?? [];
  const [active, completed, failed] = [
    queue.filter((i) => ['queued', 'downloading', 'processing'].includes(i.status)),
    queue.filter((i) => i.status === 'completed'),
    queue.filter((i) => i.status === 'failed' || i.status === 'cancelled'),
  ];

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Download</h1>
          <p className="text-sm text-muted-foreground">
            Coda di download attiva e storico recente.
          </p>
        </div>
        {completed.length + failed.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
            className="gap-1"
          >
            <Trash2 className="h-4 w-4" />
            Pulisci conclusi ({completed.length + failed.length})
          </Button>
        ) : null}
      </header>

      {queueQuery.isLoading ? (
        <Card className="p-6 text-center text-muted-foreground">Caricamento coda...</Card>
      ) : queue.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <Download className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">Nessun download in coda</p>
          <p className="text-sm text-muted-foreground">
            Vai su un anime e premi Scarica dalla sezione episodi.
          </p>
        </Card>
      ) : (
        <>
          {active.length > 0 ? (
            <Card className="divide-y p-0">
              <div className="p-3">
                <h2 className="text-sm font-semibold">In corso ({active.length})</h2>
              </div>
              {active.map((item) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  onCancel={(id) => cancelMutation.mutate({ queueId: id })}
                  onRetry={(id) => retryMutation.mutate({ queueId: id })}
                />
              ))}
            </Card>
          ) : null}

          {failed.length > 0 ? (
            <Card className="divide-y p-0">
              <div className="p-3">
                <h2 className="text-sm font-semibold text-destructive">
                  Falliti / annullati ({failed.length})
                </h2>
              </div>
              {failed.map((item) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  onCancel={(id) => cancelMutation.mutate({ queueId: id })}
                  onRetry={(id) => retryMutation.mutate({ queueId: id })}
                />
              ))}
            </Card>
          ) : null}

          {completed.length > 0 ? (
            <Card className="divide-y p-0">
              <div className="p-3">
                <h2 className="text-sm font-semibold">Completati ({completed.length})</h2>
              </div>
              {completed.map((item) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  onCancel={(id) => cancelMutation.mutate({ queueId: id })}
                  onRetry={(id) => retryMutation.mutate({ queueId: id })}
                />
              ))}
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
