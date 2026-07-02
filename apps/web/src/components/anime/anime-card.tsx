import { LanguageBadge } from '@/components/anime/language-badge';
import { useAnimationsOn } from '@/components/layout/animation-provider';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useFollowedIds } from '@/lib/use-followed';
import type { AnimeSummary } from '@animeunion/shared';
import { motion } from 'framer-motion';
import { ArrowUpRight, Check, Star } from 'lucide-react';
import Link from 'next/link';

export function AnimeCard({ anime }: { anime: AnimeSummary }) {
  const title = anime.titleIta ?? anime.title;
  const followed = useFollowedIds().has(anime.id);
  const animationsOn = useAnimationsOn();

  const card = (
    <Card className="overflow-hidden border border-border/50 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-lg">
      <div className="relative aspect-[2/3] overflow-hidden bg-muted">
        {anime.coverImage ? (
          <img
            src={anime.coverImage}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : null}
        <Badge variant="secondary" className="absolute left-2 top-2 max-w-[60%] truncate shadow-sm">
          {anime.type}
        </Badge>
        {followed ? (
          <Badge className="absolute bottom-2 left-2 gap-1 shadow-sm">
            <Check className="h-3 w-3" />
            Seguito
          </Badge>
        ) : null}
        {anime.score != null ? (
          <Badge
            variant="secondary"
            className="absolute right-2 top-2 flex items-center gap-1 shadow-sm"
          >
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            {(anime.score / 10).toFixed(1)}
          </Badge>
        ) : null}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <div className="flex items-center justify-between text-white">
            <span className="text-xs font-medium">Vedi dettagli</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
              <ArrowUpRight className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-1.5 p-3">
        {anime.availableLanguages.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {anime.availableLanguages.map((language) => (
              <LanguageBadge key={language} language={language} />
            ))}
          </div>
        ) : null}
        <h3 className="line-clamp-2 text-sm font-medium transition-colors group-hover:text-primary">
          {title}
        </h3>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="shrink-0">{anime.seasonYear ?? ''}</span>
          {anime.genres.length > 0 ? (
            <span className="min-w-0 truncate text-right">
              {anime.genres
                .slice(0, 2)
                .map((genre) => genre.name)
                .join(', ')}
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );

  return (
    <Link href={`/catalog/${anime.slug}`} className="group block" aria-label={title}>
      {/* Feedback al tocco/hover (solo transform => niente CLS), gated dall'interruttore Animazioni.
          Da OFF: nessun wrapper. L'hover CSS interno (immagine scale-105, overlay) resta invariato. */}
      {animationsOn ? (
        <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.97 }}>
          {card}
        </motion.div>
      ) : (
        card
      )}
    </Link>
  );
}
