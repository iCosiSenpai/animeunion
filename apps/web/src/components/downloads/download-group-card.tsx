'use client';

import { LanguageBadge } from '@/components/anime/language-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatBytes, formatDuration, formatSpeed, pad2 } from '@/lib/utils';
import type { DownloadQueueItem, DownloadStatus } from '@animeunion/shared';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Film,
  Gauge,
  RefreshCw,
  Timer,
  X,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

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

export interface DownloadGroup {
  animeId: string;
  animeSlug: string;
  animeTitle: string;
  animeCoverImage: string | null;
  items: DownloadQueueItem[];
}

export function groupQueue(queue: DownloadQueueItem[]): DownloadGroup[] {
  const map = new Map<string, DownloadGroup>();
  for (const item of queue) {
    let group = map.get(item.animeId);
    if (!group) {
      group = {
        animeId: item.animeId,
        animeSlug: item.animeSlug,
        animeTitle: item.animeTitle,
        animeCoverImage: item.animeCoverImage,
        items: [],
      };
      map.set(item.animeId, group);
    }
    group.items.push(item);
  }
  for (const group of map.values()) {
    group.items.sort(
      (a, b) => a.episodeNumber - b.episodeNumber || a.createdAt.localeCompare(b.createdAt),
    );
  }
  // I gruppi con download attivi in cima, poi per titolo.
  return [...map.values()].sort((a, b) => {
    const aActive = a.items.some((i) => i.status === 'downloading') ? 0 : 1;
    const bActive = b.items.some((i) => i.status === 'downloading') ? 0 : 1;
    return aActive - bActive || a.animeTitle.localeCompare(b.animeTitle, 'it');
  });
}

function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-muted ${className ?? ''}`}>
      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function aggregateStatus(items: DownloadQueueItem[]): DownloadStatus {
  if (items.some((i) => i.status === 'downloading')) return 'downloading';
  if (items.some((i) => i.status === 'processing')) return 'processing';
  if (items.some((i) => i.status === 'queued')) return 'queued';
  if (items.some((i) => i.status === 'failed')) return 'failed';
  if (items.length > 0 && items.every((i) => i.status === 'completed')) return 'completed';
  return 'cancelled';
}

export function DownloadGroupCard({
  group,
  onCancel,
  onRetry,
}: {
  group: DownloadGroup;
  onCancel: (queueId: string) => void;
  onRetry: (queueId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { items } = group;

  const total = items.length;
  const completed = items.filter((i) => i.status === 'completed').length;
  const activeItems = items.filter((i) => ACTIVE.includes(i.status));
  const failedItems = items.filter((i) => i.status === 'failed');
  const downloading = items.filter((i) => i.status === 'downloading');

  const progressSum = items.reduce((sum, i) => {
    if (i.status === 'completed') return sum + 1;
    if (i.status === 'downloading' || i.status === 'processing') return sum + i.progress;
    return sum;
  }, 0);
  const overall = total > 0 ? progressSum / total : 0;

  const speed = downloading.reduce((sum, i) => sum + (i.speedBps ?? 0), 0);
  const remaining = activeItems.reduce(
    (sum, i) => sum + (i.totalBytes != null ? Math.max(0, i.totalBytes - i.bytesDownloaded) : 0),
    0,
  );
  const eta = speed > 0 && remaining > 0 ? remaining / speed : null;

  const status = aggregateStatus(items);
  const isMovie = total === 1 && items[0]?.episodeNumber === 1 && items[0]?.episodeTitle == null;
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
                  {completed}/{total} {isMovie ? 'file' : 'episodi'}
                </span>
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
              {activeItems.length > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                  onClick={() => {
                    for (const i of activeItems) onCancel(i.id);
                  }}
                >
                  <X className="h-4 w-4" />
                  <span className="hidden sm:inline">Annulla</span>
                </Button>
              ) : null}
              {failedItems.length > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                  onClick={() => {
                    for (const i of failedItems) onRetry(i.id);
                  }}
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

      {expanded || total === 1 ? (
        <ul className="border-t bg-muted/30">
          {items.map((item) => (
            <EpisodeRow
              key={item.id}
              item={item}
              href={href}
              hideNumber={isMovie}
              onCancel={onCancel}
              onRetry={onRetry}
            />
          ))}
        </ul>
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
}: {
  item: DownloadQueueItem;
  href: string;
  hideNumber: boolean;
  onCancel: (queueId: string) => void;
  onRetry: (queueId: string) => void;
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

      <div className="flex shrink-0 items-center">
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
