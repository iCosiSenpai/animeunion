'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc';
import type { SeriesResolved } from '@animeunion/shared';
import { ArrowUpRight, Info, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ClassifyFields, type ClassifyValue } from './series-classify-fields';

function initValue(data: SeriesResolved): ClassifyValue {
  const hasParent = Boolean(data.seriesAnimeId && data.seriesAnimeId !== data.animeId);
  return {
    kind: data.kind,
    season: data.seasonNumber > 0 ? String(data.seasonNumber) : '1',
    parentId: hasParent ? data.seriesAnimeId : null,
    parentTitle: hasParent ? data.seriesTitle : '',
  };
}

/**
 * Conferma obbligatoria (tipo + stagione + destinazione) prima del primo download di una serie.
 * `ensureConfirmed(action)` esegue subito `action` se è già confermato (override impostato o serie
 * già scaricata/accodata); altrimenti apre il dialog "Classifica e scarica" e lancia `action` solo
 * dopo che l'utente conferma (salvando l'override con tipo/stagione/serie madre).
 * La risoluzione è lazy (fetch on-demand): nessuna query al mount, così le griglie di card non
 * scatenano N richieste.
 */
export function useSeasonGate(animeId: string): {
  ensureConfirmed: (action: () => void) => void;
  dialog: ReactNode;
} {
  const utils = trpc.useUtils();
  const router = useRouter();
  const setOverride = trpc.series.setOverride.useMutation();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<SeriesResolved | null>(null);
  const [value, setValue] = useState<ClassifyValue>({
    kind: 'tv',
    season: '1',
    parentId: null,
    parentTitle: '',
  });
  const pending = useRef<(() => void) | null>(null);

  const ensureConfirmed = (action: () => void) => {
    void (async () => {
      let data: SeriesResolved;
      try {
        data = await utils.series.getResolved.fetch({ animeId });
      } catch {
        // Se non riusciamo a risolvere la stagione, non blocchiamo il download.
        action();
        return;
      }
      if (data.confirmed) {
        action();
        return;
      }
      pending.current = action;
      setInfo(data);
      setValue(initValue(data));
      setOpen(true);
    })();
  };

  const close = () => {
    pending.current = null;
    setOpen(false);
  };

  const goToSeries = () => {
    const slug = info?.seriesSlug;
    close();
    if (slug) {
      router.push(`/catalog/${slug}`);
    }
  };

  const onConfirm = () => {
    const n = Number(value.season);
    const seasonNumber =
      value.kind === 'tv' ? (Number.isFinite(n) && n >= 1 ? Math.min(99, Math.floor(n)) : 1) : null;
    setOverride.mutate(
      {
        animeId,
        kind: value.kind,
        seasonNumber,
        seriesAnimeId: value.kind === 'tv' ? value.parentId : null,
      },
      {
        onSuccess: () => {
          void utils.series.getResolved.invalidate({ animeId });
          if (info?.seriesSlug) {
            void utils.catalog.bySlug.invalidate({ slug: info.seriesSlug });
          }
          setOpen(false);
          const act = pending.current;
          pending.current = null;
          act?.();
        },
        onError: (e) => toast.error(e.message || 'Impossibile salvare la classificazione'),
      },
    );
  };

  const dialog = (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Classifica e scarica</DialogTitle>
          <DialogDescription>
            {info ? (
              <>
                Controlla come e dove verrà salvato <strong>{info.seriesTitle}</strong>. Te lo
                chiediamo solo la prima volta per questo titolo.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <ClassifyFields animeId={animeId} value={value} onChange={setValue} />

        <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/30 p-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            Controlla bene la destinazione qui sopra. Potrai sempre spostare o rinominare i file dal{' '}
            <Link href="/library/files" className="text-primary underline-offset-4 hover:underline">
              gestore file
            </Link>
            .
          </span>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={goToSeries}
            disabled={setOverride.isPending || !info?.seriesSlug}
            className="gap-1"
          >
            <ArrowUpRight className="h-4 w-4" />
            Vai alla serie
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={close} disabled={setOverride.isPending}>
              Annulla
            </Button>
            <Button onClick={onConfirm} disabled={setOverride.isPending}>
              {setOverride.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Conferma e scarica
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { ensureConfirmed, dialog };
}
