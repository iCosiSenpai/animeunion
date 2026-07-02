import { AnimeCard } from '@/components/anime/anime-card';
import { Badge } from '@/components/ui/badge';
import type { CalendarItem } from '@animeunion/shared';
import { Clock } from 'lucide-react';

const GRID_CLASS = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6';

// Card del calendario: riusa la AnimeCard e aggiunge, quando l'API li fornisce (potenziamento admin
// 2026-07), l'orario di uscita e il numero dell'episodio in arrivo. Se mancano, degrada alla sola card.
function CalendarAnimeCard({ item }: { item: CalendarItem }) {
  const hasMeta = item.airTime != null || item.episodeNumber != null;
  return (
    <div className="space-y-1.5">
      <AnimeCard anime={item} />
      {hasMeta ? (
        <div className="flex flex-wrap items-center gap-1.5 px-0.5">
          {item.airTime ? (
            <Badge variant="secondary" className="gap-1 tabular-nums">
              <Clock className="h-3 w-3" />
              {item.airTime}
            </Badge>
          ) : null}
          {item.episodeNumber != null ? (
            <span className="text-xs text-muted-foreground">Ep. {item.episodeNumber}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CalendarAnimeGrid({ items }: { items: CalendarItem[] }) {
  return (
    <div className={GRID_CLASS}>
      {items.map((item) => (
        <CalendarAnimeCard key={`${item.id}_${item.episodeNumber ?? 'x'}`} item={item} />
      ))}
    </div>
  );
}
