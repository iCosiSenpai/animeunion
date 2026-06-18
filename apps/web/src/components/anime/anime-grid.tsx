import { Skeleton } from '@/components/ui/skeleton';
import type { AnimeSummary } from '@animeunion/shared';
import { AnimeCard } from './anime-card';

const GRID_CLASS = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6';

export function AnimeGrid({ anime }: { anime: AnimeSummary[] }) {
  return (
    <div className={GRID_CLASS}>
      {anime.map((item) => (
        <AnimeCard key={item.id} anime={item} />
      ))}
    </div>
  );
}

export function AnimeGridSkeleton({ count = 12 }: { count?: number }) {
  const keys = Array.from({ length: count }, (_, index) => `sk-${index}`);
  return (
    <div className={GRID_CLASS}>
      {keys.map((key) => (
        <div key={key} className="space-y-2">
          <Skeleton className="aspect-[2/3] w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4 rounded" />
          <Skeleton className="h-3 w-1/2 rounded" />
        </div>
      ))}
    </div>
  );
}
