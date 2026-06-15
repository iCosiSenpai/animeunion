import { Card } from '@/components/ui/card';
import type { NewsItem } from '@animeunion/shared';

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function NewsCard({ item }: { item: NewsItem }) {
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="group block">
      <Card className="flex h-full gap-3 overflow-hidden transition-shadow group-hover:shadow-md">
        {item.image ? (
          <img
            src={item.image}
            alt={item.title}
            loading="lazy"
            className="h-24 w-24 shrink-0 object-cover"
          />
        ) : null}
        <div className="min-w-0 space-y-1 py-2 pr-3">
          <h3 className="line-clamp-2 text-sm font-medium">{item.title}</h3>
          {item.excerpt ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">{item.excerpt}</p>
          ) : null}
          <span className="text-xs text-muted-foreground">{formatDate(item.publishedAt)}</span>
        </div>
      </Card>
    </a>
  );
}
