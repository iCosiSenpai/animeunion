import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { LatestEpisode } from '@animeunion/shared';
import Link from 'next/link';

const LANGUAGE_LABELS: Record<LatestEpisode['language'], string> = {
  SUB_ITA: 'SUB ITA',
  DUB_ITA: 'DUB ITA',
};

export function EpisodeCard({ episode }: { episode: LatestEpisode }) {
  return (
    <Link href={`/catalog/${episode.slug}`} className="group">
      <Card className="overflow-hidden transition-shadow group-hover:shadow-md">
        <div className="relative aspect-[2/3] bg-muted">
          {episode.coverImage ? (
            <img
              src={episode.coverImage}
              alt={episode.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          ) : null}
          <Badge className="absolute left-2 top-2">Ep. {episode.episodeNumber}</Badge>
          <Badge variant="secondary" className="absolute right-2 top-2">
            {LANGUAGE_LABELS[episode.language]}
          </Badge>
        </div>
        <div className="space-y-1 p-3">
          <h3 className="line-clamp-2 text-sm font-medium">{episode.title}</h3>
        </div>
      </Card>
    </Link>
  );
}

export function EpisodeGrid({ episodes }: { episodes: LatestEpisode[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {episodes.map((episode) => (
        <EpisodeCard
          key={`${episode.animeId}_${episode.episodeNumber}_${episode.language}`}
          episode={episode}
        />
      ))}
    </div>
  );
}
