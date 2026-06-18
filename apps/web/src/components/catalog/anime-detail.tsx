'use client';

import { AnimeGrid } from '@/components/anime/anime-grid';
import { FollowButton } from '@/components/anime/follow-button';
import { LanguageBadge } from '@/components/anime/language-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/lib/trpc';
import type {
  AnimeDetail as AnimeDetailType,
  EpisodeSummary,
  Language,
  RelatedAnime,
} from '@animeunion/shared';
import { ChevronDown, Download, Star } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

const STATUS_LABELS: Record<string, string> = {
  ONGOING: 'In corso',
  COMPLETED: 'Completato',
  UPCOMING: 'In arrivo',
};

const LANGUAGE_LABELS: Record<Language, string> = {
  SUB_ITA: 'SUB ITA',
  DUB_ITA: 'DUB ITA',
};

const RELATION_TYPE_LABELS: Record<string, string> = {
  SEQUEL: 'Sequel',
  PREQUEL: 'Prequel',
  SPIN_OFF: 'Spin-off',
  SIDE_STORY: 'Side story',
  PARENT_STORY: 'Storia principale',
  ALTERNATIVE: 'Alternativa',
  CHARACTER: 'Personaggi',
  SUMMARY: 'Riassunto',
  OTHER: 'Correlato',
};

function relationLabel(type: string): string {
  return RELATION_TYPE_LABELS[type] ?? type;
}

interface GroupedEpisode {
  number: number;
  title: string | null;
  languages: Language[];
  /** Mappa lingua -> episodeFileId (per il download). */
  fileIds: Partial<Record<Language, string>>;
}

function groupEpisodes(episodes: EpisodeSummary[]): GroupedEpisode[] {
  const map = new Map<number, GroupedEpisode>();
  for (const episode of episodes) {
    const existing = map.get(episode.number);
    if (existing) {
      if (!existing.languages.includes(episode.language)) {
        existing.languages.push(episode.language);
      }
      existing.fileIds[episode.language] = episode.id;
    } else {
      map.set(episode.number, {
        number: episode.number,
        title: episode.titleIta ?? episode.title,
        languages: [episode.language],
        fileIds: { [episode.language]: episode.id },
      });
    }
  }
  return [...map.values()].sort((a, b) => a.number - b.number);
}

export function AnimeDetail({ slug }: { slug: string }) {
  const { data, isLoading, error } = trpc.catalog.bySlug.useQuery({ slug });
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return <DetailSkeleton />;
  }
  if (error || !data) {
    return (
      <div className="py-24 text-center text-muted-foreground">
        {error?.data?.code === 'NOT_FOUND' ? 'Anime non trovato.' : 'Errore nel caricamento.'}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Hero anime={data} expanded={expanded} onToggle={() => setExpanded((value) => !value)} />

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Episodi</h2>
        <EpisodeList anime={data} />
      </section>

      {data.relatedAnime.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Relazioni</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {data.relatedAnime.map((related) => (
              <RelationCard key={`${related.id}_${related.relationType}`} related={related} />
            ))}
          </div>
        </section>
      ) : null}

      {data.recommendations.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Consigliati</h2>
          <AnimeGrid anime={data.recommendations} />
        </section>
      ) : null}
    </div>
  );
}

function Hero({
  anime,
  expanded,
  onToggle,
}: {
  anime: AnimeDetailType;
  expanded: boolean;
  onToggle: () => void;
}) {
  const synopsis = anime.synopsis ?? anime.synopsisEng;
  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      <div className="overflow-hidden rounded-lg bg-muted">
        {anime.coverImage ? (
          <img src={anime.coverImage} alt={anime.title} className="w-full object-cover" />
        ) : null}
      </div>
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{anime.titleIta ?? anime.title}</h1>
          {anime.titleIta && anime.titleIta !== anime.title ? (
            <p className="text-muted-foreground">{anime.title}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">{anime.type}</Badge>
          <Badge variant="outline">{STATUS_LABELS[anime.status] ?? anime.status}</Badge>
          {anime.seasonYear ? (
            <span className="text-muted-foreground">{anime.seasonYear}</span>
          ) : null}
          <span className="text-muted-foreground">{anime.episodeCount} episodi</span>
          {anime.studio ? <span className="text-muted-foreground">{anime.studio}</span> : null}
          {anime.score != null ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Star className="h-4 w-4" />
              {(anime.score / 10).toFixed(1)}
            </span>
          ) : null}
        </div>

        {anime.genres.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {anime.genres.map((genre) => (
              <Link key={genre.id} href={`/catalog?genre=${genre.slug}`}>
                <Badge variant="outline">{genre.name}</Badge>
              </Link>
            ))}
          </div>
        ) : null}

        {synopsis ? (
          <div className="space-y-1">
            <p className={expanded ? 'text-sm' : 'line-clamp-3 text-sm'}>{synopsis}</p>
            <button
              type="button"
              onClick={onToggle}
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {expanded ? 'Mostra meno' : 'Mostra tutto'}
            </button>
          </div>
        ) : null}

        <FollowButton animeId={anime.id} />
      </div>
    </div>
  );
}

function EpisodeList({ anime }: { anime: AnimeDetailType }) {
  const grouped = groupEpisodes(anime.episodes);
  const utils = trpc.useUtils();
  const addEpisodeMutation = trpc.download.addEpisode.useMutation({
    onSuccess: (res) => {
      toast.success(`Ep accodato (#${res.queueId.slice(0, 8)})`);
      void utils.download.queue.invalidate();
    },
    onError: () => toast.error('Impossibile accodare il download'),
  });
  const addAllMutation = trpc.download.addAll.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.enqueued} episodi accodati`);
      void utils.download.queue.invalidate();
    },
    onError: () => toast.error('Impossibile accodare i download'),
  });

  function onDownloadEpisode(episodeFileId: string) {
    addEpisodeMutation.mutate({ episodeFileId });
  }

  function onDownloadAll(language?: Language) {
    addAllMutation.mutate({ animeId: anime.id, language });
  }

  if (grouped.length === 0) {
    return <p className="text-sm text-muted-foreground">Nessun episodio disponibile.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={addAllMutation.isPending}
            >
              <Download className="h-4 w-4" />
              Scarica tutti mancanti
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onDownloadAll()}>Qualsiasi lingua</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDownloadAll('SUB_ITA')}>
              Solo SUB ITA
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDownloadAll('DUB_ITA')}>
              Solo DUB ITA
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="divide-y rounded-lg border">
        {grouped.map((episode) => (
          <div key={episode.number} className="flex items-center gap-3 p-3">
            <span className="w-10 shrink-0 text-sm font-medium text-muted-foreground">
              {episode.number}
            </span>
            <span className="flex-1 truncate text-sm">
              {episode.title ?? `Episodio ${episode.number}`}
            </span>
            <div className="flex shrink-0 gap-1">
              {episode.languages.map((language) => (
                <LanguageBadge key={language} language={language} />
              ))}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1"
                  disabled={addEpisodeMutation.isPending}
                >
                  <Download className="h-4 w-4" />
                  Scarica
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {episode.languages.flatMap((language, idx) => {
                  const item = (
                    <DropdownMenuItem
                      key={`lang-${language}`}
                      onSelect={() => {
                        const id = episode.fileIds[language];
                        if (id) onDownloadEpisode(id);
                      }}
                    >
                      {LANGUAGE_LABELS[language]}
                    </DropdownMenuItem>
                  );
                  if (idx === 0) return [item];
                  return [<DropdownMenuSeparator key={`sep-${language}`} />, item];
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
    </div>
  );
}

function RelationCard({ related }: { related: RelatedAnime }) {
  const title = related.titleIta ?? related.title;
  return (
    <Link href={`/catalog/${related.slug}`} className="group" aria-label={title}>
      <Card className="overflow-hidden border border-border/50 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-lg">
        <div className="relative aspect-[2/3] overflow-hidden bg-muted">
          {related.coverImage ? (
            <img
              src={related.coverImage}
              alt={title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : null}
          <Badge variant="secondary" className="absolute left-2 top-2 shadow-sm">
            {relationLabel(related.relationType)}
          </Badge>
        </div>
        <div className="p-2">
          <h3 className="line-clamp-2 text-xs font-medium transition-colors group-hover:text-primary">
            {title}
          </h3>
        </div>
      </Card>
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      <Skeleton className="aspect-[2/3] w-full rounded-lg" />
      <div className="space-y-4">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
}
