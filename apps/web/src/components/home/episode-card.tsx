'use client';

import { LanguageBadge } from '@/components/anime/language-badge';
import { useSeasonGate } from '@/components/catalog/season-gate';
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
} from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc';
import type { LatestEpisode } from '@animeunion/shared';
import { Download, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { CardCarousel } from './card-carousel';

const LANGUAGE_LABELS: Record<LatestEpisode['language'], string> = {
  SUB_ITA: 'SUB ITA',
  DUB_ITA: 'DUB ITA',
};

export function EpisodeCard({ episode }: { episode: LatestEpisode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const addEpisodeRef = trpc.download.addEpisodeRef.useMutation({
    onSuccess: () => {
      toast.success(
        `Episodio ${episode.episodeNumber} in coda (${LANGUAGE_LABELS[episode.language]})`,
      );
      void utils.download.queue.invalidate();
      setOpen(false);
    },
    onError: (error) => {
      toast.error(
        error.data?.code === 'NOT_FOUND'
          ? 'Episodio non disponibile in questa lingua'
          : 'Impossibile accodare il download',
      );
    },
  });

  const { ensureConfirmed, dialog: seasonDialog } = useSeasonGate(episode.animeId);

  function onDownload() {
    // Chiudiamo il popup info: la conferma stagione (se serve) apre il suo dialog.
    setOpen(false);
    ensureConfirmed(() =>
      addEpisodeRef.mutate({
        slug: episode.slug,
        episodeNumber: episode.episodeNumber,
        language: episode.language,
      }),
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group block text-left">
        <Card className="overflow-hidden border border-border/50 shadow-sm transition-all duration-300 group-hover:border-primary/30 group-hover:shadow-lg">
          <div className="relative aspect-[2/3] bg-muted">
            {episode.coverImage ? (
              <img
                src={episode.coverImage}
                alt={episode.title}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : null}
            {/* Solo la lingua resta sulla locandina (compatta, un angolo): il tag "Ep. N" va sotto
                per non sovrapporsi quando la card si rimpicciolisce (3 per riga su mobile). */}
            <LanguageBadge language={episode.language} className="absolute right-2 top-2" />
          </div>
          <div className="space-y-1 p-3">
            <Badge variant="secondary" className="text-[11px]">
              Ep. {episode.episodeNumber}
            </Badge>
            <h3 className="line-clamp-2 text-sm font-medium">{episode.title}</h3>
          </div>
        </Card>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{episode.title}</DialogTitle>
            <DialogDescription>
              Episodio {episode.episodeNumber} · {LANGUAGE_LABELS[episode.language]}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                setOpen(false);
                router.push(`/catalog/${episode.slug}`);
              }}
            >
              <Play className="h-4 w-4" />
              Vai alla serie completa
            </Button>
            <Button className="gap-2" onClick={onDownload} disabled={addEpisodeRef.isPending}>
              <Download className="h-4 w-4" />
              Scarica questo episodio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {seasonDialog}
    </>
  );
}

export function EpisodeGrid({ episodes }: { episodes: LatestEpisode[] }) {
  return (
    <CardCarousel className="lg:grid-cols-5">
      {episodes.map((episode) => (
        <EpisodeCard
          key={`${episode.animeId}_${episode.episodeNumber}_${episode.language}`}
          episode={episode}
        />
      ))}
    </CardCarousel>
  );
}

// Griglia a piena larghezza (non carosello) per la vista "espansa" degli ultimi episodi.
export function EpisodeGridExpanded({ episodes }: { episodes: LatestEpisode[] }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {episodes.map((episode) => (
        <EpisodeCard
          key={`${episode.animeId}_${episode.episodeNumber}_${episode.language}`}
          episode={episode}
        />
      ))}
    </div>
  );
}
