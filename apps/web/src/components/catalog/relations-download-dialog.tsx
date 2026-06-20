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
import { Film, Loader2 } from 'lucide-react';
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

export function RelationsDownloadDialog({
  related,
  language,
  open,
  onOpenChange,
}: {
  related: RelatedAnime[];
  language?: Language;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const addAllBySlug = trpc.download.addAllBySlug.useMutation();
  const utils = trpc.useUtils();

  // Reset della selezione a ogni apertura.
  useEffect(() => {
    if (open) {
      setSelected(new Set());
    }
  }, [open]);

  const toggle = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  const [working, setWorking] = useState(false);
  async function onConfirm() {
    setWorking(true);
    let total = 0;
    try {
      for (const slug of selected) {
        try {
          const res = await addAllBySlug.mutateAsync({ slug, language });
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

        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {related.map((r) => {
            const title = r.titleIta ?? r.title;
            const checked = selected.has(r.slug);
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
