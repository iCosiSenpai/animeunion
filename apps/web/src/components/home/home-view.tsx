'use client';

import { AnimeGrid, AnimeGridSkeleton } from '@/components/anime/anime-grid';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import type { AnimeSummary, Season } from '@animeunion/shared';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Newspaper,
  Play,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import type { ElementType, ReactNode } from 'react';
import { useEffect, useState } from 'react';
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

function HeroCarousel({
  anime,
  isLoading,
}: {
  anime: AnimeSummary[];
  isLoading: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (anime.length <= 1 || paused) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % anime.length);
    }, 6000);
    return () => clearInterval(id);
  }, [anime.length, paused]);

  if (isLoading) {
    return (
      <div className="relative h-72 overflow-hidden rounded-2xl bg-muted animate-pulse md:h-[28rem]">
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/60 to-transparent" />
      </div>
    );
  }

  if (anime.length === 0) {
    return (
      <div className="relative h-72 overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 to-background md:h-[28rem]">
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

  const current = anime[index] ?? anime[0];
  if (!current) return null;

  return (
    <div
      className="relative h-72 overflow-hidden rounded-2xl md:h-[28rem]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {current.coverImage ? (
        <>
          <img
            src={current.coverImage}
            alt=""
            className="absolute inset-0 h-full w-full scale-105 object-cover blur-xl saturate-150"
            loading="eager"
          />
          <div className="absolute inset-0 bg-black/40" />
        </>
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/30" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

      <div className="relative flex h-full items-end px-6 pb-8 md:px-10 md:pb-10">
        <div className="flex w-full gap-6">
          <div className="relative hidden shrink-0 overflow-hidden rounded-lg shadow-2xl md:block md:w-52 lg:w-60">
            <div className="aspect-[2/3] w-full">
              {current.coverImage ? (
                <img
                  src={current.coverImage}
                  alt={current.title}
                  className="h-full w-full object-cover"
                  loading="eager"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted">
                  <Sparkles className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-end space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              In evidenza
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl">
              {current.titleIta ?? current.title}
            </h1>
            <p className="line-clamp-2 max-w-2xl text-sm text-muted-foreground md:text-base">
              {current.type}
              {current.seasonYear ? ` · ${current.seasonYear}` : ''}
              {current.score != null ? ` · ${(current.score / 10).toFixed(1)}` : ''}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="gap-2">
                <Link href={`/catalog/${current.slug}`}>
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

      {anime.length > 1 ? (
        <>
          <button
            type="button"
            onClick={() => setIndex((prev) => (prev - 1 + anime.length) % anime.length)}
            className="absolute left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur hover:bg-background md:flex"
            aria-label="Hero precedente"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setIndex((prev) => (prev + 1) % anime.length)}
            className="absolute right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur hover:bg-background md:flex"
            aria-label="Hero successiva"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
            {anime.map((_, i) => (
              <button
                key={String(i)}
                type="button"
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all ${
                  i === index
                    ? 'w-6 bg-primary'
                    : 'w-2 bg-muted-foreground/50 hover:bg-muted-foreground'
                }`}
                aria-label={`Vai a hero ${i + 1}`}
              />
            ))}
          </div>
        </>
      ) : null}
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
    <div className="space-y-14">
      <HeroCarousel anime={featured.data ?? []} isLoading={featured.isLoading} />

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

      <div className="grid gap-14 lg:grid-cols-2">
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
      </div>

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
