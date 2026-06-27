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
import type { Language, LibraryEntry, LibraryGroup } from '@animeunion/shared';
import { ChevronDown, ChevronUp, Eye, FileVideo, HardDrive, Layers, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

const LANGUAGE_SHORT: Record<Language, string> = {
  SUB_ITA: 'SUB ITA',
  DUB_ITA: 'DUB ITA',
};

type DeleteTarget =
  | { scope: 'episode'; episodeFileId: string; title: string; warning: string }
  | { scope: 'entry'; animeId: string; language: Language; title: string; warning: string }
  | { scope: 'series'; title: string; warning: string };

function seasonLabel(seasonNumber: number): string {
  return seasonNumber === 0 ? 'Speciali' : `Stagione ${pad2(seasonNumber)}`;
}

function entrySize(entry: LibraryEntry): number {
  return entry.episodes.reduce((sum, ep) => sum + (ep.fileSize ?? 0), 0);
}

export function LibrarySeriesCard({ group }: { group: LibraryGroup }) {
  const [expanded, setExpanded] = useState(false);
  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const [deleteFolder, setDeleteFolder] = useState(false);
  const title = group.anime.titleIta ?? group.anime.title;

  // Stagioni del gruppo, ciascuna con le sue lingue (le entries sono gia' ordinate dal backend).
  const seasonsMap = new Map<number, LibraryEntry[]>();
  for (const entry of group.entries) {
    const list = seasonsMap.get(entry.seasonNumber) ?? [];
    list.push(entry);
    seasonsMap.set(entry.seasonNumber, list);
  }
  const seasons = [...seasonsMap.entries()].sort((a, b) => a[0] - b[0]);
  const seasonCount = seasons.length;

  const utils = trpc.useUtils();
  const onSuccess = (res: { deletedFiles: number; freedBytes: number; failedFiles: number }) => {
    if (res.failedFiles > 0) {
      toast.warning(
        `${res.deletedFiles} file eliminati, ${res.failedFiles} non eliminati (controlla permessi o usa il Gestore file).`,
      );
    } else {
      toast.success(`Eliminati ${res.deletedFiles} file · ${formatBytes(res.freedBytes)} liberati`);
    }
    void utils.library.list.invalidate();
    void utils.library.stats.invalidate();
    void utils.download.queue.invalidate();
    // Invalida tutto il catalogo: il delete tocca piu' stagioni/sequel (slug diversi),
    // cosi' i tag "Scaricato" delle schede anime si aggiornano ovunque al ritorno.
    void utils.catalog.invalidate();
    setTarget(null);
    setDeleteFolder(false);
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
      delEntry.mutate({ animeId: target.animeId, language: target.language, deleteFolder });
    } else {
      delSeries.mutate({ animeId: group.anime.id, deleteFolder });
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex gap-4 p-4">
          <div className="relative shrink-0 overflow-hidden rounded-md bg-muted">
            <div className="aspect-[2/3] w-24 sm:w-32">
              {group.anime.coverImage ? (
                <img
                  src={group.anime.coverImage}
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
                href={`/catalog/${group.anime.slug}`}
                className="line-clamp-2 break-words text-base font-semibold hover:text-primary sm:text-lg"
              >
                {title}
              </Link>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {group.languages.map((language) => (
                  <LanguageBadge key={language} language={language} />
                ))}
                {group.category === 'tv' && seasonCount > 1 ? (
                  <Badge variant="secondary" className="gap-1">
                    <Layers className="h-3 w-3" />
                    {seasonCount} stagioni
                  </Badge>
                ) : null}
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {group.totalEpisodes} episod{group.totalEpisodes === 1 ? 'io' : 'i'}
                </span>
                <span className="flex items-center gap-1">
                  <HardDrive className="h-3 w-3" />
                  {formatBytes(group.totalSizeBytes)}
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
                        scope: 'series',
                        title:
                          group.category === 'film'
                            ? 'Eliminare il film?'
                            : 'Eliminare l’intera serie?',
                        warning:
                          group.category === 'film'
                            ? `Verranno cancellati TUTTI i file scaricati di "${title}" (tutte le lingue).`
                            : `Verranno cancellati TUTTI i file scaricati dell'intera serie di "${title}" (tutte le stagioni e le lingue collegate).`,
                      })
                    }
                  >
                    {group.category === 'film' ? 'Elimina il film' : 'Elimina intera serie'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {expanded ? (
          <div className="space-y-4 border-t bg-muted/30 px-4 py-3">
            {seasons.map(([seasonNumber, entries]) => (
              <div key={seasonNumber} className="space-y-2">
                {group.category === 'tv' ? (
                  <h4 className="text-sm font-semibold text-muted-foreground">
                    {seasonLabel(seasonNumber)}
                  </h4>
                ) : null}
                {entries.map((entry) => (
                  <div key={`${entry.animeId}-${entry.language}`} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <LanguageBadge language={entry.language} />
                        <span>
                          {entry.episodes.length} episod{entry.episodes.length === 1 ? 'io' : 'i'}
                        </span>
                        <span>{formatBytes(entrySize(entry))}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={pending}
                        onClick={() =>
                          setTarget({
                            scope: 'entry',
                            animeId: entry.animeId,
                            language: entry.language,
                            title: `Eliminare ${
                              group.category === 'film' ? 'il film' : seasonLabel(seasonNumber)
                            } (${LANGUAGE_SHORT[entry.language]})?`,
                            warning: `Verranno cancellati i ${entry.episodes.length} file di "${title}"${
                              group.category === 'film' ? '' : ` — ${seasonLabel(seasonNumber)}`
                            } (${LANGUAGE_SHORT[entry.language]}), liberando ${formatBytes(
                              entrySize(entry),
                            )}.`,
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                        Elimina
                      </Button>
                    </div>
                    <ul className="space-y-2">
                      {entry.episodes.map((ep) => (
                        <li
                          key={ep.episodeFileId}
                          className="flex items-center justify-between gap-3 rounded-md border bg-background p-2 text-sm"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 font-mono text-xs text-muted-foreground">
                              S{pad2(seasonNumber)}E{pad2(ep.episodeNumber)}
                            </span>
                            <span className="truncate">
                              {ep.episodeTitle ?? `Episodio ${ep.episodeNumber}`}
                            </span>
                            {ep.external ? (
                              <Badge
                                variant="outline"
                                className="shrink-0 border-sky-500/50 text-sky-300"
                              >
                                Esterno
                              </Badge>
                            ) : null}
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
                            {ep.external ? null : (
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
                                    warning: `Verra' cancellato il file S${pad2(seasonNumber)}E${pad2(
                                      ep.episodeNumber,
                                    )} (${LANGUAGE_SHORT[entry.language]})${
                                      ep.fileSize != null
                                        ? `, liberando ${formatBytes(ep.fileSize)}`
                                        : ''
                                    }.`,
                                  })
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>

      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null);
            setDeleteFolder(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">{target?.title}</DialogTitle>
            <DialogDescription>
              {target?.warning} L&apos;operazione &egrave; <strong>irreversibile</strong>.
            </DialogDescription>
          </DialogHeader>
          {target?.scope === 'entry' || target?.scope === 'series' ? (
            <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-destructive"
                checked={deleteFolder}
                onChange={(e) => setDeleteFolder(e.target.checked)}
              />
              <span>
                Elimina anche la cartella della serie sul disco, compresi i{' '}
                <strong>file non tracciati / extra</strong> (sigle, sottotitoli, ecc.).
              </span>
            </label>
          ) : null}
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
