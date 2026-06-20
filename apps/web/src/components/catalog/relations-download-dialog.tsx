'use client';

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
import { trpc } from '@/lib/trpc';
import type { Language, RelatedAnime } from '@animeunion/shared';
import { Film, Layers, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const RELATION_LABELS: Record<string, string> = {
  SEQUEL: 'Sequel',
  PREQUEL: 'Prequel',
  SPIN_OFF: 'Spin-off',
  SIDE_STORY: 'Side story',
  PARENT_STORY: 'Storia principale',
  ALTERNATIVE: 'Alternativa',
  CHARACTER: 'Personaggi',
  SUMMARY: 'Riassunto',
  OTHER: 'Correlato',
};

function isTv(type: string): boolean {
  return type === 'TV' || type === 'TV_SHORT';
}

export function RelationsDownloadDialog({
  related,
  language,
  slug,
  open,
  onOpenChange,
}: {
  related: RelatedAnime[];
  language?: Language;
  /** Slug dell'anime corrente: punto di partenza per scoprire l'intero franchise. */
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [triggered, setTriggered] = useState(false);
  const addAllBySlug = trpc.download.addAllBySlug.useMutation();
  const utils = trpc.useUtils();

  // Scoperta profonda dell'intero franchise (stagioni transitive + correlati), on-demand.
  const franchise = trpc.series.franchise.useQuery(
    { slug },
    { enabled: triggered, staleTime: 5 * 60_000 },
  );

  // Reset a ogni apertura.
  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setTriggered(false);
    }
  }, [open]);

  // La lista mostrata: il franchise (se caricato) include gia' le relazioni dirette.
  const items = franchise.data ?? related;

  const toggle = (slugId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slugId)) {
        next.delete(slugId);
      } else {
        next.add(slugId);
      }
      return next;
    });
  };

  const [working, setWorking] = useState(false);
  async function onConfirm() {
    setWorking(true);
    let total = 0;
    try {
      for (const s of selected) {
        try {
          const res = await addAllBySlug.mutateAsync({ slug: s, language });
          total += res.enqueued;
        } catch {
          // continua con gli altri
        }
      }
      void utils.download.queue.invalidate();
      toast.success(
        total > 0
          ? `${total} episodi accodati dalle serie correlate`
          : 'Nessun nuovo episodio da scaricare',
      );
      onOpenChange(false);
    } finally {
      setWorking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Scaricare anche le serie correlate?</DialogTitle>
          <DialogDescription>
            Questa serie ha contenuti correlati. Seleziona quelli che vuoi scaricare (episodi
            mancanti){language ? ` in ${language === 'DUB_ITA' ? 'DUB ITA' : 'SUB ITA'}` : ''}.
          </DialogDescription>
        </DialogHeader>

        {!triggered ? (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => setTriggered(true)}
            disabled={working}
          >
            <Layers className="h-4 w-4" />
            Trova tutte le stagioni e i correlati
          </Button>
        ) : franchise.isFetching ? (
          <div className="flex items-center justify-center gap-2 rounded-md border border-dashed py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Esploro l'intera saga…
          </div>
        ) : null}

        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {items.map((r) => {
            const title = r.titleIta ?? r.title;
            const checked = selected.has(r.slug);
            const seasonBadge = isTv(r.type) && (r.seasonNumber ?? 0) > 1;
            return (
              <li key={`${r.id}_${r.relationType}`}>
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-md border p-2 transition-colors ${
                    checked ? 'border-primary bg-primary/5' : 'hover:bg-accent/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={checked}
                    onChange={() => toggle(r.slug)}
                  />
                  <span className="relative aspect-[2/3] h-14 shrink-0 overflow-hidden rounded bg-muted">
                    {r.coverImage ? (
                      <img
                        src={r.coverImage}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center">
                        <Film className="h-5 w-5 text-muted-foreground" />
                      </span>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="line-clamp-2 text-sm font-medium">{title}</span>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="secondary">
                        {RELATION_LABELS[r.relationType] ?? r.relationType}
                      </Badge>
                      {seasonBadge ? (
                        <Badge variant="outline">Stagione {r.seasonNumber}</Badge>
                      ) : null}
                      <span>{r.type}</span>
                      {r.seasonYear ? <span>· {r.seasonYear}</span> : null}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={working}>
            Non ora
          </Button>
          <Button onClick={onConfirm} disabled={working || selected.size === 0}>
            {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Scarica selezionati ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
