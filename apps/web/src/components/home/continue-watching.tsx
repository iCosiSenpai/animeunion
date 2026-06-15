import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { HistoryEntry } from '@animeunion/shared';
import Link from 'next/link';

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function ContinueWatchingCard({ entry }: { entry: HistoryEntry }) {
  const title = entry.title ?? titleFromSlug(entry.slug);
  return (
    <Link href={`/catalog/${entry.slug}`} className="group">
      <Card className="overflow-hidden transition-shadow group-hover:shadow-md">
        <div className="relative aspect-[2/3] bg-muted">
          {entry.coverImage ? (
            <img
              src={entry.coverImage}
              alt={title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          ) : null}
          <Badge className="absolute left-2 top-2">Ep. {entry.episodeNumber}</Badge>
        </div>
        <div className="space-y-1 p-3">
          <h3 className="line-clamp-2 text-sm font-medium">{title}</h3>
        </div>
      </Card>
    </Link>
  );
}

export function ContinueWatchingGrid({ entries }: { entries: HistoryEntry[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {entries.map((entry) => (
        <ContinueWatchingCard key={`${entry.animeId}_${entry.episodeNumber}`} entry={entry} />
      ))}
    </div>
  );
}
