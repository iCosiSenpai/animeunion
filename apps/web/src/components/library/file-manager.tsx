'use client';

import { RelationsDownloadDialog } from '@/components/catalog/relations-download-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import type { FileEntry } from '@animeunion/shared';
import {
  AlertTriangle,
  ChevronLeft,
  ExternalLink,
  FileVideo,
  Folder,
  FolderPlus,
  FolderX,
  Globe,
  Layers,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  Wand2,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

function formatSize(bytes: number | null): string {
  if (bytes == null) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Collega un file orfano a un episodio: cerca la serie, scegli l'episodio, sposta+marca. */
function RelinkDialog({
  file,
  onClose,
  onDone,
}: {
  file: FileEntry;
  onClose: () => void;
  onDone: () => void;
}) {
  const [search, setSearch] = useState('');
  const [slug, setSlug] = useState<string | null>(null);
  const searchQ = trpc.catalog.search.useQuery(
    { query: search },
    { enabled: !slug && search.trim().length >= 2 },
  );
  const episodesQ = trpc.episode.byAnime.useQuery({ animeSlug: slug ?? '' }, { enabled: !!slug });
  const relink = trpc.files.relink.useMutation({
    onSuccess: () => {
      toast.success('File collegato all’episodio.');
      onDone();
    },
    onError: (e) => toast.error(e.message || 'Collegamento non riuscito'),
  });

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Collega a un episodio</DialogTitle>
          <DialogDescription>
            Scegli a quale episodio appartiene <strong>{file.name}</strong>. Il file verrà spostato
            nella posizione corretta e segnato come scaricato.
          </DialogDescription>
        </DialogHeader>

        {!slug ? (
          <div className="space-y-2">
            <Input
              placeholder="Cerca la serie (min. 2 caratteri)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {searchQ.isFetching ? (
              <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Cerco…
              </div>
            ) : null}
            {search.trim().length >= 2 && searchQ.data ? (
              <ul className="max-h-56 divide-y overflow-y-auto rounded-md border text-sm">
                {searchQ.data.data.slice(0, 10).map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="block w-full truncate p-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                      onClick={() => setSlug(a.slug)}
                    >
                      {a.titleIta ?? a.title}
                    </button>
                  </li>
                ))}
                {searchQ.data.data.length === 0 ? (
                  <li className="p-2 text-xs text-muted-foreground">Nessun risultato.</li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setSlug(null)}>
              <ChevronLeft className="h-4 w-4" /> Cambia serie
            </Button>
            {episodesQ.isFetching ? (
              <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Carico gli episodi…
              </div>
            ) : (
              <ul className="max-h-56 divide-y overflow-y-auto rounded-md border text-sm">
                {(episodesQ.data ?? []).map((ep) => (
                  <li key={ep.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 p-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-50"
                      disabled={relink.isPending}
                      onClick={() => relink.mutate({ path: file.path, episodeFileId: ep.id })}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        Episodio {ep.number}
                        {(ep.titleIta ?? ep.title) ? ` — ${ep.titleIta ?? ep.title}` : ''}
                      </span>
                      <Badge variant="secondary" className="shrink-0">
                        {ep.language === 'DUB_ITA' ? 'DUB' : 'SUB'}
                      </Badge>
                    </button>
                  </li>
                ))}
                {(episodesQ.data ?? []).length === 0 && !episodesQ.isFetching ? (
                  <li className="p-2 text-xs text-muted-foreground">
                    Nessun episodio per questa serie.
                  </li>
                ) : null}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={relink.isPending}>
            Annulla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Azioni su una cartella (es. una Season scaricata esternamente): la collega a un anime di
 * AnimeUnion, poi permette di aprirne la scheda o di ri-scaricarla (elimina la cartella e
 * rimette in coda gli episodi).
 */
function FolderActionsDialog({
  folder,
  onClose,
  onChanged,
  onMultiSeasonRedownload,
}: {
  folder: FileEntry;
  onClose: () => void;
  onChanged: () => void;
  /** La cartella ha piu' stagioni: dopo l'eliminazione si passa al flusso correlazioni. */
  onMultiSeasonRedownload: (slug: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<{ slug: string; title: string } | null>(null);
  const [confirmRedownload, setConfirmRedownload] = useState(false);
  const searchQ = trpc.catalog.search.useQuery(
    { query: search },
    { enabled: !picked && search.trim().length >= 2 },
  );
  // Le sotto-cartelle di contenuto ("Season NN"/Specials/OVA/Movie) hanno extra=false; gli extra
  // (backdrops, sigle...) extra=true (vedi isExtraEntry lato backend). >=2 cartelle di contenuto =
  // serie multi-stagione: la riscarica va instradata al flusso correlazioni cosi' ogni stagione
  // viene mappata alla sua entry AnimeUnion, invece della singola addAllBySlug.
  const childrenQ = trpc.files.list.useQuery({ path: folder.path });
  const seasonFolders = (childrenQ.data?.entries ?? []).filter((e) => e.type === 'dir' && !e.extra);
  const multiSeason = seasonFolders.length >= 2;
  const addAll = trpc.download.addAllBySlug.useMutation();
  const remove = trpc.files.remove.useMutation();
  const busy = remove.isPending || addAll.isPending;

  function onRedownload() {
    if (!picked) {
      return;
    }
    remove.mutate(
      { path: folder.path },
      {
        onSuccess: () => {
          addAll.mutate(
            { slug: picked.slug },
            {
              onSuccess: (r) => {
                toast.success(`Cartella eliminata. ${r.enqueued} episodi rimessi in coda.`);
                onChanged();
              },
              onError: (e) => toast.error(e.message || 'Accodamento non riuscito'),
            },
          );
        },
        onError: (e) => toast.error(e.message || 'Eliminazione non riuscita'),
      },
    );
  }

  // Multi-stagione: elimina la cartella, poi delega al dialog correlazioni (scelta + classifica di
  // ogni stagione/correlato) invece della singola addAllBySlug che accoderebbe una sola entry.
  function onRedownloadMulti() {
    if (!picked) {
      return;
    }
    const slug = picked.slug;
    remove.mutate(
      { path: folder.path },
      {
        onSuccess: () => onMultiSeasonRedownload(slug),
        onError: (e) => toast.error(e.message || 'Eliminazione non riuscita'),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Collega “{folder.name}” a AnimeUnion</DialogTitle>
          <DialogDescription>
            Trova l’anime a cui appartiene questa cartella: potrai aprirne la scheda o ri-scaricarlo
            (elimina la cartella e rimette in coda gli episodi).
          </DialogDescription>
        </DialogHeader>

        {!picked ? (
          <div className="space-y-2">
            <Input
              placeholder="Cerca la serie (min. 2 caratteri)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {searchQ.isFetching ? (
              <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Cerco…
              </div>
            ) : null}
            {search.trim().length >= 2 && searchQ.data ? (
              <ul className="max-h-56 divide-y overflow-y-auto rounded-md border text-sm">
                {searchQ.data.data.slice(0, 10).map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="block w-full truncate p-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                      onClick={() => setPicked({ slug: a.slug, title: a.titleIta ?? a.title })}
                    >
                      {a.titleIta ?? a.title}
                    </button>
                  </li>
                ))}
                {searchQ.data.data.length === 0 ? (
                  <li className="p-2 text-xs text-muted-foreground">Nessun risultato.</li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : confirmRedownload ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">
                {multiSeason ? (
                  <>
                    La cartella <strong>{folder.name}</strong> ({seasonFolders.length} stagioni)
                    verrà eliminata. Poi sceglierai quali stagioni e correlati di{' '}
                    <strong>{picked.title}</strong> ri-scaricare e come classificarli. Operazione
                    non annullabile.
                  </>
                ) : (
                  <>
                    La cartella <strong>{folder.name}</strong> verrà eliminata e gli episodi di{' '}
                    <strong>{picked.title}</strong> rimessi in coda di download. Operazione non
                    annullabile.
                  </>
                )}
              </span>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmRedownload(false)} disabled={busy}>
                Annulla
              </Button>
              <Button
                variant="destructive"
                onClick={multiSeason ? onRedownloadMulti : onRedownload}
                disabled={busy}
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {multiSeason ? 'Elimina e scegli le stagioni' : 'Elimina e riscarica'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border p-3 text-sm">
              <p className="break-words font-medium">{picked.title}</p>
              <p className="break-all text-xs text-muted-foreground">{folder.path}</p>
            </div>
            {multiSeason ? (
              <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5 text-xs text-muted-foreground">
                <Layers className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 break-words">
                  Questa cartella contiene {seasonFolders.length} stagioni: potrai ri-scaricarle
                  tutte (e i correlati) e classificare ognuna prima di accodarla.
                </span>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <Button asChild variant="outline">
                <Link href={`/catalog/${picked.slug}`} onClick={onClose}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Apri la scheda dell’anime
                </Link>
              </Button>
              <Button variant="destructive" onClick={() => setConfirmRedownload(true)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {multiSeason ? 'Ri-scarica tutte le stagioni' : 'Ri-scarica (elimina e riscarica)'}
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setPicked(null)}>
              <ChevronLeft className="h-4 w-4" /> Cambia anime
            </Button>
          </div>
        )}

        {!confirmRedownload ? (
          <DialogFooter>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Chiudi
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function FileManager() {
  const utils = trpc.useUtils();
  const [path, setPath] = useState('');

  // Relink dinamico: mentre ci sono download in volo i file compaiono su disco poco a poco.
  // Pollo il riassunto coda (aggregato, leggero - Step 8) e tengo "viva" la lista del gestore
  // finche' qualcosa scende, cosi' cartelle/orfani passano a managed/collegato senza refresh manuale.
  const summary = trpc.download.summary.useQuery(undefined, {
    refetchInterval: (query) => {
      const c = query.state.data?.counts;
      const active = c ? c.queued + c.downloading + c.processing : 0;
      return active > 0 ? 4000 : false;
    },
  });
  const counts = summary.data?.counts;
  const downloadsActive = counts
    ? counts.queued + counts.downloading + counts.processing > 0
    : false;

  const list = trpc.files.list.useQuery(
    { path: path || undefined },
    { refetchInterval: downloadsActive ? 5000 : false },
  );

  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [renameName, setRenameName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<FileEntry | null>(null);
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [mkdirName, setMkdirName] = useState('');
  const [relinkTarget, setRelinkTarget] = useState<FileEntry | null>(null);
  const [folderTarget, setFolderTarget] = useState<FileEntry | null>(null);
  // Riscarica multi-stagione: dopo l'eliminazione della cartella si apre il dialog correlazioni
  // (riuso del catalogo) per scegliere e classificare ogni stagione/correlato.
  const [franchise, setFranchise] = useState<{ slug: string } | null>(null);
  const [toolsAction, setToolsAction] = useState<'rename-scheme' | 'prune' | null>(null);

  const refresh = () => {
    void utils.files.list.invalidate();
    // Le operazioni sui file cambiano episode_file (stato/localPath): aggiorna anche libreria,
    // coda e schede anime (tag "Scaricato"/"Collegato").
    void utils.library.list.invalidate();
    void utils.library.stats.invalidate();
    // Dallo Step 8 pagina e widget pollano download.summary (non piu' download.queue): invalido
    // l'intero router cosi' "Ri-scarica" aggiorna anche il riassunto/badge della navbar.
    void utils.download.invalidate();
    void utils.catalog.invalidate();
  };

  const renameMut = trpc.files.rename.useMutation({
    onSuccess: () => {
      toast.success('Rinominato.');
      setRenameTarget(null);
      refresh();
    },
    onError: (e) => toast.error(e.message || 'Operazione non riuscita'),
  });
  const moveMut = trpc.files.move.useMutation({
    onSuccess: () => {
      toast.success('Spostato.');
      refresh();
    },
    onError: (e) => toast.error(e.message || 'Spostamento non riuscito'),
  });
  const removeMut = trpc.files.remove.useMutation({
    onSuccess: () => {
      toast.success('Eliminato.');
      setDeleteTarget(null);
      refresh();
    },
    onError: (e) => toast.error(e.message || 'Eliminazione non riuscita'),
  });
  const mkdirMut = trpc.files.mkdir.useMutation({
    onSuccess: () => {
      toast.success('Cartella creata.');
      setMkdirOpen(false);
      setMkdirName('');
      refresh();
    },
    onError: (e) => toast.error(e.message || 'Creazione non riuscita'),
  });
  const renameSchemeMut = trpc.files.renameToScheme.useMutation({
    onSuccess: (r) => {
      toast.success(
        r.count ? `${r.count} file rinominati secondo lo schema.` : 'Nomi già a posto.',
      );
      setToolsAction(null);
      refresh();
    },
    onError: (e) => toast.error(e.message || 'Operazione non riuscita'),
  });
  const pruneMut = trpc.files.pruneEmpty.useMutation({
    onSuccess: (r) => {
      toast.success(r.count ? `${r.count} cartelle vuote eliminate.` : 'Nessuna cartella vuota.');
      setToolsAction(null);
      refresh();
    },
    onError: (e) => toast.error(e.message || 'Operazione non riuscita'),
  });

  const data = list.data;
  const atRootsLevel = !data || data.path === '';

  function onDropToDir(dirPath: string) {
    setDragOver(null);
    if (draggedPath && draggedPath !== dirPath) {
      moveMut.mutate({ path: draggedPath, destDir: dirPath });
    }
    setDraggedPath(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Gestisci i file <strong>solo da qui</strong>. Se sposti o rinomini i file direttamente sul
          NAS (fuori dall'app), l'app può perdere il collegamento e segnalarli come mancanti o
          ri-scaricarli.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Badge variant="outline" className="border-amber-500/50 text-amber-300">
            non collegato
          </Badge>
          file non associato a un episodio del catalogo
        </span>
        <span className="flex items-center gap-1.5">
          <Badge variant="outline" className="border-amber-500/50 text-amber-300">
            Non importato
          </Badge>
          cartella di contenuto non scaricata dall’app
        </span>
        <span className="flex items-center gap-1.5">
          <Badge variant="secondary">Extra</Badge>
          copertine, sigle, trailer e altre cartelle non di contenuto
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {data && data.parent !== null ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => setPath(data.parent ?? '')}
            >
              <ChevronLeft className="h-4 w-4" /> Su
            </Button>
          ) : null}
          <p className="truncate font-mono text-xs text-muted-foreground">
            {atRootsLevel ? 'Le tue cartelle' : data?.path}
          </p>
        </div>
        {!atRootsLevel ? (
          <div className="flex shrink-0 items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Wrench className="h-4 w-4" /> Strumenti
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onClick={() => setToolsAction('rename-scheme')}>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Rinomina file secondo lo schema
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setToolsAction('prune')}>
                  <FolderX className="mr-2 h-4 w-4" />
                  Elimina cartelle vuote
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setMkdirOpen(true)}
            >
              <FolderPlus className="h-4 w-4" /> Nuova cartella
            </Button>
          </div>
        ) : null}
      </div>

      {list.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : !data || data.entries.length === 0 ? (
        <EmptyState
          icon={Folder}
          title="Cartella vuota"
          description={
            atRootsLevel
              ? 'Configura le cartelle di download nelle Impostazioni per vederle qui.'
              : 'Non ci sono sottocartelle o file video qui.'
          }
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {data.entries.map((entry) => {
            const isDir = entry.type === 'dir';
            const orphan = entry.type === 'file' && !entry.episodeFileId && !entry.extra;
            return (
              <li
                key={entry.path}
                draggable={entry.type === 'file'}
                onDragStart={() => setDraggedPath(entry.path)}
                onDragEnd={() => {
                  setDraggedPath(null);
                  setDragOver(null);
                }}
                onDragOver={(e) => {
                  if (isDir && draggedPath) {
                    e.preventDefault();
                    setDragOver(entry.path);
                  }
                }}
                onDragLeave={() => isDir && setDragOver(null)}
                onDrop={() => isDir && onDropToDir(entry.path)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 text-sm transition-colors',
                  isDir &&
                    dragOver === entry.path &&
                    'bg-primary/10 ring-1 ring-inset ring-primary',
                  entry.type === 'file' && 'cursor-grab',
                )}
              >
                {isDir ? (
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    onClick={() => setPath(entry.path)}
                  >
                    <Folder className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="truncate font-medium">
                      {atRootsLevel ? entry.path : entry.name}
                    </span>
                    {!atRootsLevel && !entry.managed ? (
                      entry.extra ? (
                        <Badge variant="secondary" className="shrink-0">
                          Extra
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="shrink-0 border-amber-500/50 text-amber-300"
                        >
                          Non importato
                        </Badge>
                      )
                    ) : null}
                  </button>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <FileVideo
                      className="h-5 w-5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="truncate">{entry.name}</span>
                    {orphan ? (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-amber-500/50 text-amber-300"
                      >
                        non collegato
                      </Badge>
                    ) : entry.extra ? (
                      <Badge variant="secondary" className="shrink-0">
                        Extra
                      </Badge>
                    ) : null}
                    {entry.size != null ? (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatSize(entry.size)}
                      </span>
                    ) : null}
                  </div>
                )}

                {!atRootsLevel ? (
                  <div className="flex shrink-0 items-center gap-1">
                    {isDir ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-primary"
                        title="Collega a AnimeUnion / Ri-scarica"
                        aria-label={`Collega ${entry.name} a AnimeUnion o ri-scarica`}
                        onClick={() => setFolderTarget(entry)}
                      >
                        <Globe className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {orphan ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-primary"
                        title="Collega a un episodio"
                        aria-label={`Collega ${entry.name} a un episodio`}
                        onClick={() => setRelinkTarget(entry)}
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Rinomina"
                      aria-label={`Rinomina ${entry.name}`}
                      onClick={() => {
                        setRenameTarget(entry);
                        setRenameName(entry.name);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      title="Elimina"
                      aria-label={`Elimina ${entry.name}`}
                      onClick={() => setDeleteTarget(entry)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* Rinomina */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => (o ? null : setRenameTarget(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {renameTarget?.type === 'dir' && renameTarget.managed
                ? 'Rinomina la serie'
                : 'Rinomina'}
            </DialogTitle>
            <DialogDescription className="break-words">
              Nuovo nome per “{renameTarget?.name}”.
            </DialogDescription>
          </DialogHeader>
          <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} />
          {renameTarget?.type === 'dir' && renameTarget.managed ? (
            <p className="rounded-md border border-primary/30 bg-primary/5 p-2.5 text-xs text-muted-foreground">
              I collegamenti agli episodi di questa serie verranno aggiornati automaticamente: i
              file restano scaricati e nella libreria.
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRenameTarget(null)}
              disabled={renameMut.isPending}
            >
              Annulla
            </Button>
            <Button
              onClick={() =>
                renameTarget && renameMut.mutate({ path: renameTarget.path, newName: renameName })
              }
              disabled={
                renameMut.isPending || !renameName.trim() || renameName === renameTarget?.name
              }
            >
              {renameMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Rinomina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nuova cartella */}
      <Dialog open={mkdirOpen} onOpenChange={setMkdirOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuova cartella</DialogTitle>
            <DialogDescription>Creala dentro la cartella corrente.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Nome cartella"
            value={mkdirName}
            onChange={(e) => setMkdirName(e.target.value)}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setMkdirOpen(false)}
              disabled={mkdirMut.isPending}
            >
              Annulla
            </Button>
            <Button
              onClick={() => data && mkdirMut.mutate({ parent: data.path, name: mkdirName })}
              disabled={mkdirMut.isPending || !mkdirName.trim()}
            >
              {mkdirMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Crea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Elimina */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => (o ? null : setDeleteTarget(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminare “{deleteTarget?.name}”?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.type === 'dir'
                ? 'La cartella e tutto il suo contenuto verranno eliminati. Operazione non annullabile.'
                : 'Il file verrà eliminato dal disco. Operazione non annullabile.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={removeMut.isPending}
            >
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && removeMut.mutate({ path: deleteTarget.path })}
              disabled={removeMut.isPending}
            >
              {removeMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Strumenti cartella: conferma */}
      <Dialog open={!!toolsAction} onOpenChange={(o) => (o ? null : setToolsAction(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {toolsAction === 'rename-scheme'
                ? 'Rinomina file secondo lo schema'
                : 'Elimina cartelle vuote'}
            </DialogTitle>
            <DialogDescription>
              {toolsAction === 'rename-scheme'
                ? 'Sposta e rinomina i file collegati al catalogo dentro questa cartella secondo lo schema corrente (tipo, stagione, parte). I file non collegati o gli extra non vengono toccati.'
                : 'Rimuove ricorsivamente tutte le sottocartelle vuote sotto la cartella corrente. I file non vengono toccati.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setToolsAction(null)}
              disabled={renameSchemeMut.isPending || pruneMut.isPending}
            >
              Annulla
            </Button>
            <Button
              onClick={() => {
                if (!data) {
                  return;
                }
                if (toolsAction === 'rename-scheme') {
                  renameSchemeMut.mutate({ path: data.path });
                } else {
                  pruneMut.mutate({ path: data.path });
                }
              }}
              disabled={renameSchemeMut.isPending || pruneMut.isPending}
            >
              {renameSchemeMut.isPending || pruneMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {relinkTarget ? (
        <RelinkDialog
          file={relinkTarget}
          onClose={() => setRelinkTarget(null)}
          onDone={() => {
            setRelinkTarget(null);
            refresh();
          }}
        />
      ) : null}

      {folderTarget ? (
        <FolderActionsDialog
          folder={folderTarget}
          onClose={() => setFolderTarget(null)}
          onChanged={() => {
            setFolderTarget(null);
            refresh();
          }}
          onMultiSeasonRedownload={(slug) => {
            setFolderTarget(null);
            setFranchise({ slug });
            refresh();
          }}
        />
      ) : null}

      {franchise ? (
        <RelationsDownloadDialog
          related={[]}
          slug={franchise.slug}
          open
          autoDiscover
          onOpenChange={(o) => {
            if (!o) {
              setFranchise(null);
              refresh();
            }
          }}
        />
      ) : null}
    </div>
  );
}
