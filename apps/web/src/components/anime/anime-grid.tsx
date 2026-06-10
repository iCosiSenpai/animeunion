import type { AnimeSummary } from '@animeunion/shared';
import { Skeleton } from '@/components/ui/skeleton';
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
        <Skeleton key={key} className="aspect-[2/3] w-full rounded-lg" />
      ))}
    </div>
  );
}
