'use client';

import { AnimeGrid, AnimeGridSkeleton } from '@/components/anime/anime-grid';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import type { AnimeSummary, Season } from '@animeunion/shared';
import { Calendar, ChevronRight, Clock, Newspaper, Play, Sparkles, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import type { ElementType, ReactNode } from 'react';
import { ContinueWatchingGrid } from './continue-watching';
import { EpisodeGrid } from './episode-card';
import { NewsCard } from './news-card';

const SEASON_BY_MONTH: Season[] = [
  'WINTER',
  'WINTER',
  'WINTER',
  'SPRING',
  'SPRING',
  'SPRING',
  'SUMMER',
  'SUMMER',
  'SUMMER',
  'FALL',
  'FALL',
  'FALL',
];

const SEASON_LABELS: Record<Season, string> = {
  WINTER: 'Inverno',
  SPRING: 'Primavera',
  SUMMER: 'Estate',
  FALL: 'Autunno',
};

const JS_DAY_TO_WEEKDAY = [
  'DOMENICA',
  'LUNEDI',
  'MARTEDI',
  'MERCOLEDI',
  'GIOVEDI',
  'VENERDI',
  'SABATO',
] as const;

function SectionHeader({
  icon: Icon,
  title,
  href,
  action,
}: {
  icon: ElementType;
  title: string;
  href?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      {action ? (
        action
      ) : href ? (
        <Button variant="ghost" size="sm" asChild className="gap-1 text-muted-foreground">
          <Link href={href}>
            Vedi tutto
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function Section({
  title,
  icon,
  items,
  isLoading,
  href,
}: {
  title: string;
  icon: ElementType;
  items: AnimeSummary[];
  isLoading: boolean;
  href?: string;
}) {
  if (!isLoading && items.length === 0) {
    return null;
  }
  return (
    <section className="space-y-1">
      <SectionHeader icon={icon} title={title} href={href} />
      {isLoading ? <AnimeGridSkeleton count={6} /> : <AnimeGrid anime={items.slice(0, 12)} />}
    </section>
  );
}

/** Wrapper di sezione generico per contenuti non-AnimeSummary (episodi, news, cronologia). */
function SectionBlock({
  title,
  icon,
  isLoading,
  isEmpty,
  children,
}: {
  title: string;
  icon: ElementType;
  isLoading: boolean;
  isEmpty: boolean;
  children: ReactNode;
}) {
  if (isLoading || isEmpty) {
    return null;
  }
  return (
    <section className="space-y-1">
      <SectionHeader icon={icon} title={title} />
      {children}
    </section>
  );
}

function HeroBanner({
  anime,
  isLoading,
}: {
  anime: AnimeSummary | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="relative h-64 overflow-hidden rounded-2xl bg-muted animate-pulse md:h-80">
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/60 to-transparent" />
      </div>
    );
  }

  if (!anime) {
    return (
      <div className="relative h-64 overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 to-background md:h-80">
        <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/70 to-transparent" />
        <div className="relative flex h-full flex-col justify-center px-6 md:px-10">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl">AnimeUnion</h1>
          <p className="mt-2 max-w-md text-muted-foreground md:text-lg">
            Scopri, segui e scarica i tuoi anime preferiti in un solo posto.
          </p>
          <div className="mt-6 flex gap-3">
            <Button asChild>
              <Link href="/catalog">Esplora il catalogo</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-64 overflow-hidden rounded-2xl md:h-80">
      {anime.coverImage ? (
        <img
          src={anime.coverImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/40" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

      <div className="relative flex h-full flex-col justify-end px-6 pb-8 md:px-10 md:pb-10">
        <div className="max-w-xl space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            In evidenza
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl">
            {anime.titleIta ?? anime.title}
          </h1>
          <p className="line-clamp-2 text-sm text-muted-foreground md:text-base">
            {anime.type}
            {anime.seasonYear ? ` · ${anime.seasonYear}` : ''}
            {anime.score != null ? ` · ${(anime.score / 10).toFixed(1)}` : ''}
          </p>
          <div className="flex gap-3">
            <Button asChild className="gap-2">
              <Link href={`/catalog/${anime.slug}`}>
                <Play className="h-4 w-4" />
                Vai al dettaglio
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/catalog">Esplora il catalogo</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomeView() {
  const now = new Date();
  const season = SEASON_BY_MONTH[now.getMonth()] ?? 'WINTER';
  const year = now.getFullYear();
  const todayWeekday = JS_DAY_TO_WEEKDAY[now.getDay()] ?? 'LUNEDI';

  const week = trpc.calendar.week.useQuery();
  const seasonal = trpc.catalog.bySeason.useQuery({ season, year, page: 1 });
  const topRated = trpc.catalog.topRated.useQuery({ page: 1 });
  const recent = trpc.catalog.recent.useQuery({ page: 1 });
  const latestEpisodes = trpc.home.latestEpisodes.useQuery();
  const featured = trpc.home.featured.useQuery();
  const continueWatching = trpc.library.history.useQuery();
  const news = trpc.home.news.useQuery();

  const todayAnime = week.data?.find((entry) => entry.day === todayWeekday)?.anime ?? [];

  return (
    <div className="space-y-12">
      <HeroBanner anime={featured.data?.[0]} isLoading={featured.isLoading} />

      <Section
        title="In evidenza"
        icon={Sparkles}
        items={(featured.data ?? []).slice(1)}
        isLoading={featured.isLoading}
      />

      <SectionBlock
        title="Ultimi episodi"
        icon={Play}
        isLoading={latestEpisodes.isLoading}
        isEmpty={(latestEpisodes.data ?? []).length === 0}
      >
        <EpisodeGrid episodes={(latestEpisodes.data ?? []).slice(0, 10)} />
      </SectionBlock>

      <SectionBlock
        title="Continua a guardare"
        icon={Clock}
        isLoading={continueWatching.isLoading}
        isEmpty={(continueWatching.data ?? []).length === 0}
      >
        <ContinueWatchingGrid entries={(continueWatching.data ?? []).slice(0, 12)} />
      </SectionBlock>

      <Section
        title="In onda oggi"
        icon={Calendar}
        items={todayAnime}
        isLoading={week.isLoading}
        href="/calendar"
      />

      <Section
        title={`Stagione in corso · ${SEASON_LABELS[season]} ${year}`}
        icon={Calendar}
        items={seasonal.data?.data ?? []}
        isLoading={seasonal.isLoading}
        href={`/catalog?season=${season}&year=${year}`}
      />

      <Section
        title="Più votati"
        icon={TrendingUp}
        items={topRated.data?.data ?? []}
        isLoading={topRated.isLoading}
      />

      <Section
        title="Ultimi aggiunti"
        icon={Clock}
        items={recent.data?.data ?? []}
        isLoading={recent.isLoading}
      />

      <SectionBlock
        title="News"
        icon={Newspaper}
        isLoading={news.isLoading}
        isEmpty={(news.data ?? []).length === 0}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {(news.data ?? []).map((item) => (
            <NewsCard key={item.slug} item={item} />
          ))}
        </div>
      </SectionBlock>
    </div>
  );
}
