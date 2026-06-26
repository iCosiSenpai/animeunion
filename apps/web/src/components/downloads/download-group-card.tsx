'use client';

import { LanguageBadge } from '@/components/anime/language-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { formatBytes, formatDuration, formatSpeed, pad2 } from '@/lib/utils';
import type {
  DownloadFilter,
  DownloadGroupSummary,
  DownloadQueueItem,
  DownloadStatus,
} from '@animeunion/shared';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUp,
  Film,
  Gauge,
  Loader2,
  RefreshCw,
  Timer,
  X,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

const PAGE_SIZE = 50;

export const STATUS_LABELS: Record<DownloadStatus, string> = {
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

const ACTIVE: DownloadStatus[] = ['queued', 'downloading', 'processing'];

function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-muted ${className ?? ''}`}>
      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

// Stato aggregato del gruppo dai soli conteggi (niente lista completa delle righe).
function aggregateStatus(g: DownloadGroupSummary): DownloadStatus {
  if (g.downloading > 0) return 'downloading';
  if (g.processing > 0) return 'processing';
  if (g.queued > 0) return 'queued';
  if (g.failed > 0) return 'failed';
  if (g.total > 0 && g.completed === g.total) return 'completed';
  return 'cancelled';
}

export function DownloadGroupCard({
  group,
  filter,
  onCancelGroup,
  onRetryGroup,
  onCancel,
  onRetry,
  onPrioritize,
}: {
  group: DownloadGroupSummary;
  filter: DownloadFilter;
  onCancelGroup: (animeId: string) => void;
  onRetryGroup: (animeId: string) => void;
  onCancel: (queueId: string) => void;
  onRetry: (queueId: string) => void;
  onPrioritize: (queueId: string) => void;
}) {
  const total = group.total;
  const isSingle = total === 1;
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const showItems = expanded || isSingle;
  const hasActive = group.queued + group.downloading + group.processing > 0;
  const hasInflight = group.downloading + group.processing > 0;

  // Cambio filtro dal genitore: riparti dalla prima pagina (reset in render, niente effetto).
  const [prevFilter, setPrevFilter] = useState(filter);
  if (prevFilter !== filter) {
    setPrevFilter(filter);
    setPage(0);
  }

  const itemsQuery = trpc.download.groupItems.useQuery(
    { animeId: group.animeId, filter, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    {
      enabled: showItems,
      // Aggiorna le righe espanse solo mentre il gruppo ha download in volo.
      refetchInterval: hasInflight ? 1500 : false,
      placeholderData: (prev) => prev,
    },
  );

  const items = itemsQuery.data?.items ?? [];
  const filteredTotal = itemsQuery.data?.total ?? total;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));

  const downloading = group.activeItems.filter((i) => i.status === 'downloading');
  const speed = downloading.reduce((sum, i) => sum + (i.speedBps ?? 0), 0);
  const remaining = group.activeItems.reduce(
    (sum, i) => sum + (i.totalBytes != null ? Math.max(0, i.totalBytes - i.bytesDownloaded) : 0),
    0,
  );
  const eta = speed > 0 && remaining > 0 ? remaining / speed : null;
  const activeProgress = group.activeItems.reduce((sum, i) => sum + i.progress, 0);
  const overall = total > 0 ? (group.completed + activeProgress) / total : 0;
  const status = aggregateStatus(group);

  const isMovie = isSingle && items[0]?.episodeNumber === 1 && items[0]?.episodeTitle == null;
  const href = `/catalog/${group.animeSlug}`;

  return (
    <Card className="overflow-hidden">
      <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
        <Link
          href={href}
          className="relative aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-md bg-muted sm:w-20"
        >
          {group.animeCoverImage ? (
            <img
              src={group.animeCoverImage}
              alt={group.animeTitle}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Film className="h-7 w-7 text-muted-foreground" />
            </div>
          )}
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link href={href} className="line-clamp-1 font-semibold hover:text-primary">
                {group.animeTitle}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>
                <span>
                  {group.completed}/{total} {isMovie ? 'file' : 'episodi'}
                </span>
                {group.queued > 0 ? <span>{group.queued} in coda</span> : null}
                {group.failed > 0 ? (
                  <span className="text-destructive">{group.failed} falliti</span>
                ) : null}
                {speed > 0 ? (
                  <span className="flex items-center gap-1">
                    <Gauge className="h-3 w-3" />
                    {formatSpeed(speed)}
                  </span>
                ) : null}
                {eta ? (
                  <span className="flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    {formatDuration(eta)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {hasActive ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                  onClick={() => onCancelGroup(group.animeId)}
                >
                  <X className="h-4 w-4" />
                  <span className="hidden sm:inline">Annulla</span>
                </Button>
              ) : null}
              {group.failed > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                  onClick={() => onRetryGroup(group.animeId)}
                >
                  <RefreshCw className="h-4 w-4" />
                  <span className="hidden sm:inline">Riprova</span>
                </Button>
              ) : null}
              {total > 1 ? (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={expanded ? 'Comprimi' : 'Espandi'}
                  onClick={() => setExpanded((p) => !p)}
                >
                  {expanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ProgressBar value={overall} />
            <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums">
              {Math.round(overall * 100)}%
            </span>
          </div>
        </div>
      </div>

      {showItems ? (
        <div className="border-t bg-muted/30">
          {itemsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Caricamento episodi…
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nessun episodio in questa categoria.
            </p>
          ) : (
            <ul>
              {items.map((item) => (
                <EpisodeRow
                  key={item.id}
                  item={item}
                  href={href}
                  hideNumber={isMovie}
                  onCancel={onCancel}
                  onRetry={onRetry}
                  onPrioritize={onPrioritize}
                />
              ))}
            </ul>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground sm:px-4">
              <span className="tabular-nums">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredTotal)} di{' '}
                {filteredTotal}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label="Pagina precedente"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="tabular-nums">
                  {page + 1}/{totalPages}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label="Pagina successiva"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function EpisodeRow({
  item,
  href,
  hideNumber,
  onCancel,
  onRetry,
  onPrioritize,
}: {
  item: DownloadQueueItem;
  href: string;
  hideNumber: boolean;
  onCancel: (queueId: string) => void;
  onRetry: (queueId: string) => void;
  onPrioritize: (queueId: string) => void;
}) {
  const isActive = ACTIVE.includes(item.status);
  const remaining =
    item.totalBytes != null ? Math.max(0, item.totalBytes - item.bytesDownloaded) : null;
  const eta = item.speedBps && remaining ? remaining / item.speedBps : null;

  return (
    <li className="flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {!hideNumber ? (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            E{pad2(item.episodeNumber)}
          </span>
        ) : null}
        <Link href={href} className="truncate hover:text-primary">
          {item.episodeTitle ?? (hideNumber ? 'Film' : `Episodio ${item.episodeNumber}`)}
        </Link>
        <LanguageBadge language={item.language} />
      </div>

      {isActive ? (
        <div className="flex w-40 shrink-0 items-center gap-2">
          <ProgressBar value={item.progress} className="h-1.5" />
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
            {Math.round(item.progress * 100)}%
          </span>
        </div>
      ) : item.status === 'completed' ? (
        <span className="flex shrink-0 items-center gap-1 text-xs text-green-500">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {item.totalBytes ? formatBytes(item.totalBytes) : 'OK'}
        </span>
      ) : item.status === 'failed' ? (
        <span className="flex max-w-[12rem] shrink-0 items-center gap-1 truncate text-xs text-destructive">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{item.error ?? 'Errore'}</span>
        </span>
      ) : (
        <Badge variant="outline" className="shrink-0">
          {STATUS_LABELS[item.status]}
        </Badge>
      )}

      <div className="flex w-16 shrink-0 items-center justify-end gap-1 text-xs text-muted-foreground">
        {item.status === 'downloading' && item.speedBps ? formatSpeed(item.speedBps) : null}
        {eta ? <span className="hidden sm:inline">{formatDuration(eta)}</span> : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {item.status === 'queued' ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Scarica prima"
            title="Scarica prima"
            onClick={() => onPrioritize(item.id)}
          >
            <ChevronsUp className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {isActive ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Annulla"
            onClick={() => onCancel(item.id)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        ) : item.status === 'failed' ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Riprova"
            onClick={() => onRetry(item.id)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <span className="inline-block h-7 w-7" aria-hidden />
        )}
      </div>
    </li>
  );
}
