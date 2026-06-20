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
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';
import type { SeriesResolved } from '@animeunion/shared';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useRef, useState } from 'react';
import { toast } from 'sonner';

/**
 * Conferma obbligatoria della stagione prima del primo download di una serie.
 * `ensureConfirmed(action)` esegue subito `action` se la stagione è già confermata
 * (override impostato o serie già scaricata/accodata); altrimenti apre il dialog e
 * lancia `action` solo dopo che l'utente conferma (salvando l'override).
 * La risoluzione è lazy (fetch on-demand): nessuna query al mount, così le griglie
 * di card non scatenano N richieste.
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
  const [season, setSeason] = useState('1');
  const [isSpecial, setIsSpecial] = useState(false);
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
      setIsSpecial(data.seasonNumber === 0);
      setSeason(data.seasonNumber > 0 ? String(data.seasonNumber) : '1');
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
    const parsed = isSpecial ? 0 : Number(season);
    const seasonNumber =
      Number.isFinite(parsed) && parsed >= 0 ? Math.min(99, Math.floor(parsed)) : 1;
    setOverride.mutate(
      { animeId, seasonNumber },
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
        onError: (e) => toast.error(e.message || 'Impossibile salvare la stagione'),
      },
    );
  };

  const dialog = (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isSpecial
              ? 'Confermi che è uno Special?'
              : `Confermi che è la Stagione ${season || '?'}?`}
          </DialogTitle>
          <DialogDescription>
            {info ? (
              <>
                Stai per scaricare da <strong>{info.seriesTitle}</strong>. Te lo chiediamo solo la
                prima volta per questa serie.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Stagione</span>
            <Input
              type="number"
              min={1}
              max={99}
              className="w-24"
              value={season}
              disabled={isSpecial}
              onChange={(e) => setSeason(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={isSpecial}
              onChange={(e) => setIsSpecial(e.target.checked)}
            />
            È uno special (OAV / extra) → cartella "Specials"
          </label>
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
