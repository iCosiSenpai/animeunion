'use client';

import { LanguageBadge } from '@/components/anime/language-badge';
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
      toast.success(`Ep ${episode.episodeNumber} accodato (${LANGUAGE_LABELS[episode.language]})`);
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

  function onDownload() {
    addEpisodeRef.mutate({
      slug: episode.slug,
      episodeNumber: episode.episodeNumber,
      language: episode.language,
    });
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
            <Badge className="absolute left-2 top-2">Ep. {episode.episodeNumber}</Badge>
            <LanguageBadge language={episode.language} className="absolute right-2 top-2" />
          </div>
          <div className="space-y-1 p-3">
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
    </>
  );
}

export function EpisodeGrid({ episodes }: { episodes: LatestEpisode[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {episodes.map((episode) => (
        <EpisodeCard
          key={`${episode.animeId}_${episode.episodeNumber}_${episode.language}`}
          episode={episode}
        />
      ))}
    </div>
  );
}
