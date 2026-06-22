'use client';

import { ClassifyFields, type ClassifyValue } from '@/components/catalog/series-classify-fields';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc';
import type { LibraryMissingEntry } from '@animeunion/shared';
import { Download, Loader2, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

interface AnimeGroup {
  animeId: string;
  animeSlug: string;
  title: string;
  seasonNumber: number;
  episodes: LibraryMissingEntry[];
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
      };
      map.set(e.animeId, g);
    }
    g.episodes.push(e);
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
          <DialogTitle className="truncate">Classifica: {title}</DialogTitle>
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

export function MissingDialog({
  open,
  entries,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  entries: LibraryMissingEntry[];
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const groups = useMemo(() => groupByAnime(entries), [entries]);
  const addMissing = trpc.download.addMissing.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.enqueued} episodi rimessi in coda`);
      onChanged();
    },
    onError: (e) => toast.error(e.message || 'Ri-scarica non riuscito'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Episodi mancanti</DialogTitle>
          <DialogDescription>
            Questi episodi risultano scaricati nel database ma non sono stati trovati su disco.
            Correggi la classificazione se la destinazione è sbagliata, poi ri-scaricali.
          </DialogDescription>
        </DialogHeader>

        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun episodio mancante.</p>
        ) : (
          <ul className="space-y-2">
            {groups.map((g) => (
              <li
                key={g.animeId}
                className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{g.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Stagione {g.seasonNumber} · {g.episodes.length} episod
                    {g.episodes.length === 1 ? 'io' : 'i'} mancant
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
              </li>
            ))}
          </ul>
        )}

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
          {groups.length > 1 ? (
            <Button
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
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
