'use client';

import { useSeasonGate } from '@/components/catalog/season-gate';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FOLLOW_STATUSES } from '@/lib/follow';
import { trpc } from '@/lib/trpc';
import { formatBytes } from '@/lib/utils';
import type { FollowWithAnime } from '@animeunion/shared';
import { Download, MoreVertical, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

export function FollowCard({ follow }: { follow: FollowWithAnime }) {
  const utils = trpc.useUtils();
  const [confirmDeleteFiles, setConfirmDeleteFiles] = useState(false);
  const [deleteFolder, setDeleteFolder] = useState(false);

  const invalidate = () => {
    void utils.follow.list.invalidate();
  };

  const updateStatus = trpc.follow.updateStatus.useMutation({
    onSuccess: () => {
      toast.success('Stato aggiornato');
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = trpc.follow.remove.useMutation({
    onSuccess: () => {
      toast.success('Rimosso dai seguiti');
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const setAuto = trpc.follow.setAutoDownload.useMutation({
    onSuccess: () => {
      toast.success('Auto-download aggiornato');
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const addAll = trpc.download.addAll.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.enqueued} episodi accodati`);
      void utils.download.invalidate();
    },
    onError: (error) => toast.error(error.message || 'Impossibile accodare i download'),
  });
  // Riusa la stessa delete della libreria: rimuove tutti i file scaricati della serie
  // (tutte le stagioni/lingue collegate), opzionalmente anche la cartella.
  const deleteFiles = trpc.library.deleteSeries.useMutation({
    onSuccess: (res) => {
      if (res.failedFiles > 0) {
        toast.warning(
          `${res.deletedFiles} file eliminati, ${res.failedFiles} non eliminati (controlla i permessi o usa il Gestore file).`,
        );
      } else if (res.deletedFiles === 0) {
        toast.info('Nessun file scaricato da eliminare per questa serie.');
      } else {
        toast.success(
          `Eliminati ${res.deletedFiles} file · ${formatBytes(res.freedBytes)} liberati`,
        );
      }
      void utils.library.list.invalidate();
      void utils.library.stats.invalidate();
      void utils.download.invalidate();
      // Aggiorna i tag "Scaricato" ovunque (il delete tocca piu' stagioni/sequel, slug diversi).
      void utils.catalog.invalidate();
      void utils.follow.list.invalidate();
      setConfirmDeleteFiles(false);
      setDeleteFolder(false);
    },
    onError: (error) => toast.error(error.message || 'Eliminazione fallita'),
  });

  const anime = follow.anime;
  const { ensureConfirmed, dialog: seasonDialog } = useSeasonGate(anime.id);
  // Serie conclusa: niente auto-download (coerente con enqueueForAutoFollows che esclude i COMPLETED).
  const isCompleted = anime.status === 'COMPLETED';
  const autoEffective = follow.autoDownload ?? follow.status === 'watching';
  // I file scaricati si possono eliminare quando la serie e' conclusa o abbandonata
  // (per gli stati "attivi" si continua a scaricare).
  const canDeleteFiles = follow.status === 'completed' || follow.status === 'dropped';
  const title = anime.titleIta ?? anime.title;

  return (
    <Card className="group overflow-hidden border border-border/50 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-lg">
      <div className="relative aspect-[2/3] bg-muted">
        <Link href={`/catalog/${anime.slug}`}>
          {anime.coverImage ? (
            <img
              src={anime.coverImage}
              alt={anime.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : null}
        </Link>
        <div className="absolute right-1 top-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" className="h-8 w-8" aria-label="Azioni">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/catalog/${anime.slug}`}>Vai al dettaglio</Link>
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Cambia stato</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {FOLLOW_STATUSES.map((status) => (
                    <DropdownMenuItem
                      key={status.value}
                      disabled={status.value === follow.status}
                      onClick={() =>
                        updateStatus.mutate({ animeId: anime.id, status: status.value })
                      }
                    >
                      {status.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                onClick={() => ensureConfirmed(() => addAll.mutate({ animeId: anime.id }))}
              >
                Scarica episodi mancanti
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isCompleted}
                onClick={() => setAuto.mutate({ animeId: anime.id, autoDownload: !autoEffective })}
              >
                {autoEffective ? 'Disattiva auto-download' : 'Attiva auto-download'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {canDeleteFiles ? (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setConfirmDeleteFiles(true)}
                >
                  Elimina file scaricati
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => remove.mutate({ animeId: anime.id })}
              >
                Smetti di seguire
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {autoEffective && !isCompleted ? (
          <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm">
            <Download className="h-3 w-3" />
            Auto
          </span>
        ) : null}
      </div>

      {seasonDialog}
      <div className="p-3">
        <Link
          href={`/catalog/${anime.slug}`}
          className="line-clamp-2 text-sm font-medium hover:underline"
        >
          {title}
        </Link>
      </div>

      <Dialog
        open={confirmDeleteFiles}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDeleteFiles(false);
            setDeleteFolder(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Eliminare i file scaricati?</DialogTitle>
            <DialogDescription>
              Verranno cancellati tutti i file scaricati di &laquo;{title}&raquo; (tutte le stagioni
              e le lingue collegate). L&apos;operazione &egrave; <strong>irreversibile</strong>.
              L&apos;anime resta tra i seguiti.
            </DialogDescription>
          </DialogHeader>
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
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteFiles(false)}
              disabled={deleteFiles.isPending}
            >
              Annulla
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              disabled={deleteFiles.isPending}
              onClick={() => deleteFiles.mutate({ animeId: anime.id, deleteFolder })}
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
