'use client';

import { LanguageBadge } from '@/components/anime/language-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { trpc } from '@/lib/trpc';
import { formatBytes, formatDate, pad2 } from '@/lib/utils';
import type { LibraryItem } from '@animeunion/shared';
import { ChevronDown, ChevronUp, Eye, FileVideo, HardDrive, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

const LANGUAGE_SHORT: Record<LibraryItem['language'], string> = {
  SUB_ITA: 'SUB ITA',
  DUB_ITA: 'DUB ITA',
};

type DeleteTarget =
  | { scope: 'episode'; episodeFileId: string; title: string; warning: string }
  | { scope: 'entry'; title: string; warning: string }
  | { scope: 'series'; title: string; warning: string };

export function LibrarySeriesCard({ item }: { item: LibraryItem }) {
  const [expanded, setExpanded] = useState(false);
  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const title = item.anime.titleIta ?? item.anime.title;
  const totalSize = item.episodes.reduce((sum, ep) => sum + (ep.fileSize ?? 0), 0);

  const utils = trpc.useUtils();
  const onSuccess = (res: { deletedFiles: number; freedBytes: number }) => {
    toast.success(`Eliminati ${res.deletedFiles} file · ${formatBytes(res.freedBytes)} liberati`);
    void utils.library.list.invalidate();
    void utils.library.stats.invalidate();
    void utils.download.queue.invalidate();
    void utils.catalog.bySlug.invalidate({ slug: item.anime.slug });
    setTarget(null);
  };
  const onError = () => toast.error('Eliminazione fallita');
  const delEpisode = trpc.library.deleteEpisode.useMutation({ onSuccess, onError });
  const delEntry = trpc.library.deleteEntry.useMutation({ onSuccess, onError });
  const delSeries = trpc.library.deleteSeries.useMutation({ onSuccess, onError });
  const pending = delEpisode.isPending || delEntry.isPending || delSeries.isPending;

  function confirmDelete() {
    if (!target) return;
    if (target.scope === 'episode') {
      delEpisode.mutate({ episodeFileId: target.episodeFileId });
    } else if (target.scope === 'entry') {
      delEntry.mutate({ animeId: item.anime.id, language: item.language });
    } else {
      delSeries.mutate({ animeId: item.anime.id });
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex gap-4 p-4">
          <div className="relative shrink-0 overflow-hidden rounded-md bg-muted">
            <div className="aspect-[2/3] w-24 sm:w-32">
              {item.anime.coverImage ? (
                <img
                  src={item.anime.coverImage}
                  alt={title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <FileVideo className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-between">
            <div className="space-y-1">
              <Link
                href={`/catalog/${item.anime.slug}`}
                className="line-clamp-1 text-base font-semibold hover:text-primary sm:text-lg"
              >
                {title}
              </Link>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">Stagione {pad2(item.seasonNumber)}</Badge>
                <LanguageBadge language={item.language} />
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {item.episodes.length} episod{item.episodes.length === 1 ? 'io' : 'i'}
                </span>
                <span className="flex items-center gap-1">
                  <HardDrive className="h-3 w-3" />
                  {formatBytes(totalSize)}
                </span>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((prev) => !prev)}
                className="gap-1"
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {expanded ? 'Nascondi episodi' : 'Vedi episodi'}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="destructive" size="sm" className="gap-1" disabled={pending}>
                    <Trash2 className="h-4 w-4" />
                    Elimina
                    <ChevronDown className="h-3 w-3 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() =>
                      setTarget({
                        scope: 'entry',
                        title: `Eliminare questa stagione (${LANGUAGE_SHORT[item.language]})?`,
                        warning: `Verranno cancellati i ${item.episodes.length} file di "${title}" — Stagione ${pad2(
                          item.seasonNumber,
                        )} (${LANGUAGE_SHORT[item.language]}), liberando ${formatBytes(totalSize)}.`,
                      })
                    }
                  >
                    Elimina questa stagione ({LANGUAGE_SHORT[item.language]})
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() =>
                      setTarget({
                        scope: 'series',
                        title: 'Eliminare l’intera serie?',
                        warning: `Verranno cancellati TUTTI i file scaricati dell'intera serie di "${title}" (tutte le stagioni e le lingue collegate).`,
                      })
                    }
                  >
                    Elimina intera serie
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {expanded ? (
          <div className="border-t bg-muted/30 px-4 py-3">
            <ul className="space-y-2">
              {item.episodes.map((ep) => (
                <li
                  key={ep.episodeId}
                  className="flex items-center justify-between gap-3 rounded-md border bg-background p-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      S{pad2(item.seasonNumber)}E{pad2(ep.episodeNumber)}
                    </span>
                    <span className="truncate">
                      {ep.episodeTitle ?? `Episodio ${ep.episodeNumber}`}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    {ep.fileSize != null ? <span>{formatBytes(ep.fileSize)}</span> : null}
                    {ep.downloadedAt ? <span>{formatDate(ep.downloadedAt)}</span> : null}
                    {ep.localPath ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <FileVideo className="h-4 w-4" />
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-md break-all">
                            <p>{ep.localPath}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Elimina episodio"
                      disabled={pending}
                      onClick={() =>
                        setTarget({
                          scope: 'episode',
                          episodeFileId: ep.episodeFileId,
                          title: 'Eliminare questo episodio?',
                          warning: `Verra' cancellato il file S${pad2(item.seasonNumber)}E${pad2(
                            ep.episodeNumber,
                          )} (${LANGUAGE_SHORT[item.language]})${
                            ep.fileSize != null ? `, liberando ${formatBytes(ep.fileSize)}` : ''
                          }.`,
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">{target?.title}</DialogTitle>
            <DialogDescription>
              {target?.warning} L&apos;operazione &egrave; <strong>irreversibile</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={pending}>
              Annulla
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              onClick={confirmDelete}
              disabled={pending}
            >
              <Trash2 className="h-4 w-4" />
              Elimina definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
