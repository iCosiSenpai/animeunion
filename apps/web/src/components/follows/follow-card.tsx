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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isFollowPaused } from '@/lib/follow';
import { trpc } from '@/lib/trpc';
import {
  type LibraryOptimisticTransaction,
  useLibraryOptimisticCache,
} from '@/lib/use-library-optimistic-cache';
import { formatBytes } from '@/lib/utils';
import type { FollowWithAnime } from '@animeunion/shared';
import { Download, MoreVertical, Pause, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

export function FollowCard({ follow }: { follow: FollowWithAnime }) {
  const utils = trpc.useUtils();
  const optimistic = useLibraryOptimisticCache();
  const [confirmDeleteFiles, setConfirmDeleteFiles] = useState(false);
  const [deleteFolder, setDeleteFolder] = useState(false);
  const [confirmUnfollow, setConfirmUnfollow] = useState(false);
  // Cestino attivo: le eliminazioni spostano in `.trash` (recuperabile), quindi adattiamo la copy.
  const trashEnabled = trpc.config.getAll.useQuery(undefined, { staleTime: 60_000 }).data
    ?.trashEnabled;

  const invalidate = () => {
    void utils.follow.list.invalidate();
  };

  const updateStatus = trpc.follow.updateStatus.useMutation({
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(error.message),
  });
  const remove = trpc.follow.remove.useMutation({
    onSuccess: () => {
      toast.success('Rimosso dai seguiti');
      setConfirmUnfollow(false);
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
      toast.success(
        res.enqueued > 0 ? `${res.enqueued} episodi in coda` : 'Nessun nuovo episodio da scaricare',
      );
      void utils.download.invalidate();
    },
    onError: (error) => toast.error(error.message || 'Impossibile accodare i download'),
  });
  // Riusa la stessa delete della libreria: rimuove tutti i file scaricati della serie
  // (tutte le stagioni/lingue collegate), opzionalmente anche la cartella.
  const onDeleteError = (
    error: { message?: string },
    snapshot: LibraryOptimisticTransaction | undefined,
  ) => {
    optimistic.restore(snapshot);
    toast.error(error.message || 'Eliminazione fallita');
  };
  const deleteFiles = trpc.library.deleteSeries.useMutation({
    onMutate: () =>
      optimistic.remove({
        scope: 'series',
        animeId: follow.anime.id,
      }),
    onSuccess: (res) => {
      const protectedExternalFiles = res.protectedExternalFiles ?? 0;
      const protectedNonTargetFiles = res.protectedNonTargetFiles ?? 0;
      const failedFolders = res.failedFolders ?? 0;
      if (
        res.failedFiles > 0 ||
        failedFolders > 0 ||
        protectedExternalFiles > 0 ||
        protectedNonTargetFiles > 0
      ) {
        const action = trashEnabled ? 'spostati nel cestino' : 'eliminati';
        const issues = [
          res.failedFiles > 0 ? `${res.failedFiles} non rimossi: controlla i permessi.` : '',
          failedFolders > 0
            ? `${failedFolders} cartelle non rimosse: i file contenuti restano sul disco.`
            : '',
          protectedExternalFiles > 0
            ? `${protectedExternalFiles} file esterni protetti: la cartella è rimasta sul disco.`
            : '',
          protectedNonTargetFiles > 0
            ? `${protectedNonTargetFiles} download fuori dalla selezione protetti: la cartella è rimasta sul disco.`
            : '',
        ].filter(Boolean);
        toast.warning(`${res.deletedFiles} file ${action}. ${issues.join(' ')}`);
      } else if (res.deletedFiles === 0) {
        toast.info('Nessun file scaricato da eliminare per questa serie.');
      } else if (trashEnabled) {
        toast.success(
          `${res.deletedFiles} file spostati nel cestino · ${formatBytes(res.freedBytes)} recuperabili`,
        );
      } else {
        toast.success(
          `Eliminati ${res.deletedFiles} file · ${formatBytes(res.freedBytes)} liberati`,
        );
      }
      setConfirmDeleteFiles(false);
      setDeleteFolder(false);
    },
    onError: (error, _input, snapshot) => onDeleteError(error, snapshot),
    onSettled: (_data, _error, _input, transaction) => optimistic.settle(transaction),
  });

  const anime = follow.anime;
  const { ensureConfirmed, dialog: seasonDialog } = useSeasonGate(anime.id);
  // Serie conclusa: l'auto-download resta attivabile (lo stato d'onda non e' piu' un gate, vedi
  // enqueueForAutoFollows), mostriamo solo una nota informativa.
  const isCompleted = anime.status === 'COMPLETED';
  // In pausa = on_hold, o legacy "dropped" (stesso comportamento). Preferenza auto = esplicita o
  // default su watching; effettiva solo se non in pausa.
  const paused = isFollowPaused(follow.status);
  const autoPref = follow.autoDownload ?? follow.status === 'watching';
  const autoActive = autoPref && !paused;
  // I file scaricati si possono eliminare quando la serie è in pausa o conclusa (per le serie
  // attive si continua a scaricare: si evita così la cancellazione accidentale).
  const canDeleteFiles = paused || follow.status === 'completed';
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
              <DropdownMenuItem
                onClick={() =>
                  updateStatus.mutate({
                    animeId: anime.id,
                    status: paused ? 'watching' : 'on_hold',
                  })
                }
              >
                {paused ? 'Riprendi (togli pausa)' : 'Metti in pausa'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => ensureConfirmed(() => addAll.mutate({ animeId: anime.id }))}
              >
                Scarica episodi mancanti
              </DropdownMenuItem>
              {!paused ? (
                <DropdownMenuItem
                  onClick={() => setAuto.mutate({ animeId: anime.id, autoDownload: !autoPref })}
                >
                  {autoPref ? 'Disattiva auto-download' : 'Attiva auto-download'}
                </DropdownMenuItem>
              ) : null}
              {isCompleted && !paused ? (
                <div className="px-2 py-1 text-[11px] leading-tight text-muted-foreground">
                  Serie conclusa: di norma non escono nuovi episodi.
                </div>
              ) : null}
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
                onClick={() => setConfirmUnfollow(true)}
              >
                Smetti di seguire
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {autoActive ? (
          <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm">
            <Download className="h-3 w-3" />
            Auto
          </span>
        ) : paused ? (
          <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">
            <Pause className="h-3 w-3" />
            In pausa
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

      <Dialog open={confirmUnfollow} onOpenChange={setConfirmUnfollow}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smettere di seguire?</DialogTitle>
            <DialogDescription>
              &laquo;{title}&raquo; uscirà dai Seguiti (e dai Preferiti del sito). I file già
              scaricati <strong>restano nella libreria</strong> e non vengono cancellati: puoi
              rimuoverli a parte con «Elimina file scaricati».
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmUnfollow(false)}
              disabled={remove.isPending}
            >
              Annulla
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              onClick={() => remove.mutate({ animeId: anime.id })}
              disabled={remove.isPending}
            >
              <Trash2 className="h-4 w-4" />
              Smetti di seguire
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              Verranno rimossi dalla Libreria tutti i file scaricati di &laquo;{title}&raquo; (tutte
              le stagioni e le lingue collegate).{' '}
              {trashEnabled ? (
                <>
                  I file verranno spostati nel <strong>cestino</strong> e restano recuperabili dal
                  Gestore file.
                </>
              ) : (
                <>
                  L&apos;operazione &egrave; <strong>irreversibile</strong>.
                </>
              )}{' '}
              L&apos;anime resta tra i seguiti. I file <strong>esterni</strong> collegati non
              vengono mai eliminati.
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
              <strong>file non tracciati / extra</strong> (sigle, sottotitoli, ecc.). Se contiene
              file esterni collegati o download attivi fuori dalla selezione, la cartella viene
              preservata e sono rimossi solo i file inclusi nell&apos;operazione.
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
              {trashEnabled ? 'Sposta nel cestino' : 'Elimina definitivamente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
