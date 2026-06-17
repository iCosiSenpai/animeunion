'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { trpc } from '@/lib/trpc';
import type { DownloadQueueItem, DownloadStatus, Language } from '@animeunion/shared';
import { CheckCircle2, Download, Film, RefreshCw, Trash2, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_LABELS: Record<DownloadStatus, string> = {
  queued: 'In coda',
  downloading: 'In download',
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
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function DownloadCard({
  item,
  onCancel,
  onRetry,
}: {
  item: DownloadQueueItem;
  onCancel: (queueId: string) => void;
  onRetry: (queueId: string) => void;
}) {
  const isActive = ['queued', 'downloading', 'processing'].includes(item.status);

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex flex-1 gap-4 p-4">
        <div className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-md bg-muted sm:w-24">
          {item.animeCoverImage ? (
            <img
              src={item.animeCoverImage}
              alt={item.animeTitle}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Film className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div className="space-y-1">
            <p className="truncate text-sm font-semibold">{item.animeTitle}</p>
            <p className="text-xs text-muted-foreground">
              Episodio {item.episodeNumber}
              {item.episodeTitle ? ` · ${item.episodeTitle}` : ''}
            </p>
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANT[item.status]}>{STATUS_LABELS[item.status]}</Badge>
              <Badge variant="outline">{LANGUAGE_LABELS[item.language]}</Badge>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            {isActive ? (
              <Button size="sm" variant="ghost" onClick={() => onCancel(item.id)} className="gap-1">
                <X className="h-4 w-4" />
                Annulla
              </Button>
            ) : item.status === 'failed' ? (
              <Button size="sm" variant="ghost" onClick={() => onRetry(item.id)} className="gap-1">
                <RefreshCw className="h-4 w-4" />
                Riprova
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {isActive ? (
        <div className="border-t px-4 py-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {item.status === 'queued'
                ? 'In attesa di uno slot libero'
                : item.status === 'downloading'
                  ? 'Download in corso'
                  : 'Rinominata e spostamento finale'}
            </span>
            <span className="font-medium">{Math.round(item.progress * 100)}%</span>
          </div>
          <ProgressBar value={item.progress} />
          {item.error ? <p className="mt-2 text-xs text-destructive">{item.error}</p> : null}
        </div>
      ) : item.status === 'failed' ? (
        <div className="border-t px-4 py-3">
          <p className="flex items-center gap-1 text-xs text-destructive">
            <XCircle className="h-3 w-3" />
            {item.error ?? 'Errore sconosciuto'}
          </p>
        </div>
      ) : item.status === 'completed' ? (
        <div className="border-t px-4 py-3">
          <p className="flex items-center gap-1 text-xs text-green-500">
            <CheckCircle2 className="h-3 w-3" />
            Completato
          </p>
        </div>
      ) : null}
    </Card>
  );
}

function Section({
  title,
  children,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  if (empty) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

export function DownloadsView() {
  const utils = trpc.useUtils();
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

  const cancelMutation = trpc.download.cancel.useMutation({
    onSuccess: (res) => {
      if (res.cancelled) {
        toast.success('Download annullato');
      } else {
        toast.error('Impossibile annullare (gia concluso?)');
      }
      void utils.download.queue.invalidate();
    },
    onError: () => toast.error('Errore durante la cancellazione'),
  });

  const retryMutation = trpc.download.retry.useMutation({
    onSuccess: (res) => {
      if (res.retried) {
        toast.success('Download rimesso in coda');
      } else {
        toast.error('Impossibile riprovare (non in stato failed)');
      }
      void utils.download.queue.invalidate();
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
  const active = queue.filter((i) => ['queued', 'downloading', 'processing'].includes(i.status));
  const completed = queue.filter((i) => i.status === 'completed');
  const failed = queue.filter((i) => i.status === 'failed' || i.status === 'cancelled');

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Download</h1>
          <p className="text-sm text-muted-foreground">
            Coda attiva e storico degli episodi scaricati.
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
            Pulisci conclusi
          </Button>
        ) : null}
      </header>

      {queueQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {['s-1', 's-2', 's-3'].map((key) => (
            <Card key={key} className="h-40 animate-pulse bg-muted" />
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
      ) : (
        <ScrollArea className="h-[calc(100vh-14rem)]">
          <div className="space-y-8 pr-4">
            <Section title={`In corso (${active.length})`} empty={active.length === 0}>
              {active.map((item) => (
                <DownloadCard
                  key={item.id}
                  item={item}
                  onCancel={(id) => cancelMutation.mutate({ queueId: id })}
                  onRetry={(id) => retryMutation.mutate({ queueId: id })}
                />
              ))}
            </Section>

            <Section title={`Completati (${completed.length})`} empty={completed.length === 0}>
              {completed.map((item) => (
                <DownloadCard
                  key={item.id}
                  item={item}
                  onCancel={() => undefined}
                  onRetry={() => undefined}
                />
              ))}
            </Section>

            <Section title={`Errori (${failed.length})`} empty={failed.length === 0}>
              {failed.map((item) => (
                <DownloadCard
                  key={item.id}
                  item={item}
                  onCancel={() => undefined}
                  onRetry={(id) => retryMutation.mutate({ queueId: id })}
                />
              ))}
            </Section>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
