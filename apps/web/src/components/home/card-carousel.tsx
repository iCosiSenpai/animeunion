import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

// Riga di card: su mobile scorre in orizzontale con snap (accorcia lo scroll verticale della Home),
// su md+ torna a griglia. I figli diretti vengono dimensionati via selettore `[&>*]` cosi' il
// componente resta agnostico dal tipo di card (AnimeCard, EpisodeCard, ContinueWatchingCard).
// Default desktop: 4 colonne (md) / 6 (lg); override via `className` (es. "lg:grid-cols-5").
const CAROUSEL_CLASS = cn(
  'flex snap-x snap-proximity gap-4 overflow-x-auto pb-2',
  '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
  '[&>*]:w-[42vw] [&>*]:max-w-[12rem] [&>*]:shrink-0 [&>*]:snap-start',
  'md:grid md:grid-cols-4 md:gap-4 md:overflow-x-visible md:pb-0 lg:grid-cols-6',
  'md:[&>*]:w-auto md:[&>*]:max-w-none',
);

export function CardCarousel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(CAROUSEL_CLASS, className)}>{children}</div>;
}

export function CardCarouselSkeleton({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  const keys = Array.from({ length: count }, (_, index) => `csk-${index}`);
  return (
    <CardCarousel className={className}>
      {keys.map((key) => (
        <div key={key} className="space-y-2">
          <Skeleton className="aspect-[2/3] w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4 rounded" />
        </div>
      ))}
    </CardCarousel>
  );
}
