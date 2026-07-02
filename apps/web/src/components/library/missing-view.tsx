'use client';

import { ClassifyFields, type ClassifyValue } from '@/components/catalog/series-classify-fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { trpc } from '@/lib/trpc';
import type { LibraryMissingEntry } from '@animeunion/shared';
import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  SearchCheck,
  SlidersHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

interface AnimeGroup {
  animeId: string;
  animeSlug: string;
  title: string;
  seasonNumber: number;
  episodes: LibraryMissingEntry[];
  /** Numeri di episodio mancanti, distinti e ordinati (più lingue contano una volta). */
  numbers: number[];
}

function groupByAnime(entries: LibraryMissingEntry[]): AnimeGroup[] {
  const map = new Map<string, AnimeGroup>();
  for (const e of entries) {
    let g = map.get(e.animeId);
    if (!g) {
      g = {
        animeId: e.animeId,
        animeSlug: e.animeSlug,
        title: e.animeTitle ?? e.animeSlug,
        seasonNumber: e.seasonNumber,
        episodes: [],
        numbers: [],
      };
      map.set(e.animeId, g);
    }
    g.episodes.push(e);
  }
  for (const g of map.values()) {
    g.numbers = [...new Set(g.episodes.map((e) => e.episodeNumber))].sort((a, b) => a - b);
  }
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'it'));
}

/** Classifica (modifica l'override di tipo/stagione/parte/madre) un anime prima di ri-scaricare. */
function ClassifyButton({ animeId, title }: { animeId: string; title: string }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<ClassifyValue>({
    kind: 'tv',
    season: '1',
    part: '1',
    parentId: null,
    parentTitle: '',
  });
  const setOverride = trpc.series.setOverride.useMutation({
    onSuccess: () => {
      toast.success('Classificazione salvata');
      setOpen(false);
    },
    onError: (e) => toast.error(e.message || 'Salvataggio non riuscito'),
  });

  async function onOpenChange(next: boolean) {
    if (next) {
      try {
        const data = await utils.series.getResolved.fetch({ animeId });
        const hasParent = Boolean(data.seriesAnimeId && data.seriesAnimeId !== animeId);
        setValue({
          kind: data.kind,
          season: data.seasonNumber > 0 ? String(data.seasonNumber) : '1',
          part: data.partNumber > 0 ? String(data.partNumber) : '1',
          parentId: hasParent ? data.seriesAnimeId : null,
          parentTitle: hasParent ? data.seriesTitle : '',
        });
      } catch {
        // se non risolve, parte dai default
      }
    }
    setOpen(next);
  }

  function onSave() {
    const n = Number(value.season);
    const p = Number(value.part);
    setOverride.mutate({
      animeId,
      kind: value.kind,
      seasonNumber: value.kind === 'tv' ? (Number.isFinite(n) && n >= 1 ? n : 1) : null,
      partNumber: value.kind === 'tv' && Number.isFinite(p) && p >= 1 ? Math.min(20, p) : null,
      seriesAnimeId: value.kind === 'tv' ? value.parentId : null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" title="Classifica">
          <SlidersHorizontal className="h-4 w-4" /> Classifica
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="break-words">Classifica: {title}</DialogTitle>
          <DialogDescription>
            Correggi tipo, stagione, parte e serie madre prima di ri-scaricare.
          </DialogDescription>
        </DialogHeader>
        <ClassifyFields animeId={animeId} value={value} onChange={setValue} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={setOverride.isPending}>
            Annulla
          </Button>
          <Button onClick={onSave} disabled={setOverride.isPending}>
            {setOverride.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const MAX_CHIPS = 40;

function seasonLabel(seasonNumber: number): string {
  return seasonNumber === 0 ? 'Speciali' : `Stagione ${seasonNumber}`;
}

/** Vista dedicata a tutta larghezza degli episodi mancanti su disco (sostituisce il dialog). */
export function MissingView() {
  const utils = trpc.useUtils();
  const listQuery = trpc.library.list.useQuery();
  const scan = trpc.library.scan.useMutation({
    onSuccess: () => {
      void utils.library.stats.invalidate();
      void utils.library.list.invalidate();
    },
    onError: () => toast.error('Scansione non riuscita'),
  });
  const addMissing = trpc.download.addMissing.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.enqueued} episodi rimessi in coda`);
      void utils.download.invalidate();
    },
    onError: (e) => toast.error(e.message || 'Ri-scarica non riuscito'),
  });

  // Auto-avvio del controllo appena si entra nella pagina (il badge "Mancanti" della libreria
  // porta qui): l'utente vede subito cosa manca senza dover premere "Controlla la libreria".
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoRan.current) {
      autoRan.current = true;
      scan.mutate();
    }
  }, [scan]);

  const result = scan.data ?? null;
  const groups = useMemo(() => groupByAnime(result?.missingEntries ?? []), [result]);

  // Episodi presenti per animeId (dalla libreria) per il quadro "cosa c'è / cosa manca".
  const presentByAnime = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of listQuery.data ?? []) {
      for (const e of g.entries) {
        map.set(e.animeId, (map.get(e.animeId) ?? 0) + e.episodes.length);
      }
    }
    return map;
  }, [listQuery.data]);

  const checked = scan.isSuccess;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Confronta gli episodi segnati come scaricati con quelli presenti su disco. Quelli mancanti
          vengono marcati da ri-scaricare.
        </p>
        <Button onClick={() => scan.mutate()} disabled={scan.isPending} className="gap-2">
          {scan.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SearchCheck className="h-4 w-4" />
          )}
          {scan.isPending ? 'Controllo…' : checked ? 'Ricontrolla' : 'Controlla la libreria'}
        </Button>
      </div>

      {result ? (
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="secondary">Trovati su disco: {result.found}</Badge>
          {result.missing > 0 ? (
            <Badge variant="destructive">Mancanti: {result.missing}</Badge>
          ) : null}
          {result.orphans > 0 ? <Badge variant="outline">Orfani: {result.orphans}</Badge> : null}
        </div>
      ) : null}

      {!checked && !scan.isPending ? (
        <EmptyState
          icon={SearchCheck}
          title="Controlla cosa manca"
          description="Avvia un controllo per vedere, serie per serie, quali episodi risultano scaricati ma non sono più sul disco."
        />
      ) : null}

      {checked && groups.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Tutto a posto"
          description="Nessun episodio mancante: ogni file scaricato è presente su disco."
        />
      ) : null}

      {groups.length > 0 ? (
        <div className="space-y-3">
          {groups.length > 1 ? (
            <div className="flex justify-end">
              <Button
                variant="outline"
                className="gap-1.5"
                disabled={addMissing.isPending}
                onClick={() => {
                  for (const g of groups) {
                    addMissing.mutate({ animeId: g.animeId });
                  }
                }}
              >
                <Download className="h-4 w-4" /> Ri-scarica tutti
              </Button>
            </div>
          ) : null}

          {groups.map((g) => {
            const present = presentByAnime.get(g.animeId) ?? 0;
            const shown = g.numbers.slice(0, MAX_CHIPS);
            const extra = g.numbers.length - shown.length;
            return (
              <Card key={g.animeId} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <Link
                      href={`/catalog/${g.animeSlug}`}
                      className="break-words font-semibold hover:text-primary"
                    >
                      {g.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {seasonLabel(g.seasonNumber)} · {present} present
                      {present === 1 ? 'e' : 'i'} · {g.episodes.length} mancant
                      {g.episodes.length === 1 ? 'e' : 'i'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ClassifyButton animeId={g.animeId} title={g.title} />
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={addMissing.isPending}
                      onClick={() => addMissing.mutate({ animeId: g.animeId })}
                    >
                      <Download className="h-4 w-4" /> Ri-scarica
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {shown.map((n) => (
                    <Badge key={n} variant="outline" className="font-mono text-xs">
                      Ep {n}
                    </Badge>
                  ))}
                  {extra > 0 ? (
                    <Badge variant="secondary" className="text-xs">
                      +{extra} altri
                    </Badge>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}

      {scan.isPending && !result ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : null}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <RefreshCw className="h-3 w-3" />
        Dopo la ri-scarica gli episodi rientrano dalla coda di download.
      </p>
    </div>
  );
}
