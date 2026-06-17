import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { AnimeSummary } from '@animeunion/shared';
import { Star } from 'lucide-react';
import Link from 'next/link';

export function AnimeCard({ anime }: { anime: AnimeSummary }) {
  return (
    <Link href={`/catalog/${anime.slug}`} className="group">
      <Card className="group overflow-hidden border border-border/50 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-lg">
        <div className="relative aspect-[2/3] bg-muted">
          {anime.coverImage ? (
            <img
              src={anime.coverImage}
              alt={anime.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : null}
          <Badge variant="secondary" className="absolute left-2 top-2">
            {anime.type}
          </Badge>
        </div>
        <div className="space-y-1 p-3">
          <h3 className="line-clamp-2 text-sm font-medium">{anime.titleIta ?? anime.title}</h3>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{anime.seasonYear ?? ''}</span>
            {anime.score != null ? (
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3" />
                {(anime.score / 10).toFixed(1)}
              </span>
            ) : null}
          </div>
        </div>
      </Card>
    </Link>
  );
}
