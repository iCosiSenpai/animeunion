'use client';

import { AnimeCard } from '@/components/anime/anime-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import type {
  AnimeSummary,
  FeaturedAnime,
  HomeSectionId,
  PaginatedAnime,
  Season,
} from '@animeunion/shared';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Newspaper,
  Play,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import type { ElementType, ReactNode } from 'react';
import { Fragment, useEffect, useState } from 'react';
import { CardCarousel, CardCarouselSkeleton } from './card-carousel';
import { ContinueWatchingGrid } from './continue-watching';
import { EpisodeGrid } from './episode-card';
import { resolveHomeOrder } from './home-sections';
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
  carouselClassName,
  loadMore,
}: {
  title: string;
  icon: ElementType;
  items: AnimeSummary[];
  isLoading: boolean;
  href?: string;
  carouselClassName?: string;
  /** Carica la pagina successiva (sezioni paginate): abilita "Carica altri" da espanse. */
  loadMore?: (page: number) => Promise<PaginatedAnime>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [extra, setExtra] = useState<AnimeSummary[]>([]);
  const [nextPage, setNextPage] = useState(2);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Dedup difensivo (una pagina potrebbe ripetere un id al confine): mantiene le key React uniche.
  const seen = new Set<string>();
  const all = [...items, ...extra].filter((a) => (seen.has(a.id) ? false : seen.add(a.id)));

  if (!isLoading && all.length === 0) {
    return null;
  }

  // Espandere ha senso se possiamo caricare altro (paginata) o se c'e' gia' piu' di una riga.
  const canExpand = all.length > 0 && (loadMore != null || all.length > 6);

  async function onLoadMore() {
    if (!loadMore) {
      return;
    }
    setLoadingMore(true);
    try {
      const res = await loadMore(nextPage);
      setExtra((prev) => [...prev, ...res.data]);
      setNextPage((p) => p + 1);
      setHasMore(res.meta.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="space-y-1">
      <SectionHeader
        icon={icon}
        title={title}
        href={expanded ? undefined : href}
        action={
          canExpand ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? (
                <>
                  Mostra di meno <ChevronUp className="h-4 w-4" />
                </>
              ) : (
                <>
                  Mostra di più <ChevronDown className="h-4 w-4" />
                </>
              )}
            </Button>
          ) : undefined
        }
      />
      {isLoading ? (
        <CardCarouselSkeleton count={6} className={carouselClassName} />
      ) : expanded ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {all.map((item) => (
              <AnimeCard key={item.id} anime={item} />
            ))}
          </div>
          {loadMore && hasMore ? (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore ? 'Carico…' : 'Carica altri'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <CardCarousel className={carouselClassName}>
          {all.slice(0, 12).map((item) => (
            <AnimeCard key={item.id} anime={item} />
          ))}
        </CardCarousel>
      )}
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
  anime: FeaturedAnime[];
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
      <div className="relative h-[26rem] overflow-hidden rounded-2xl bg-muted animate-pulse md:h-[32rem] lg:h-[36rem]">
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/40" />
        <div className="absolute bottom-10 left-6 md:bottom-12 md:left-10 lg:left-14">
          <div className="h-8 w-48 rounded bg-foreground/10 md:h-10 md:w-80" />
          <div className="mt-3 h-4 w-32 rounded bg-foreground/10 md:w-48" />
        </div>
      </div>
    );
  }

  if (anime.length === 0) {
    return (
      <div className="relative h-[26rem] overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 to-background md:h-[32rem] lg:h-[36rem]">
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
        <div className="relative flex h-full flex-col justify-center px-6 md:px-10 lg:px-14">
          <h1 className="text-3xl font-black tracking-tight md:text-5xl">AnimeUnion</h1>
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
      className="relative h-[26rem] overflow-hidden rounded-2xl shadow-lg md:h-[32rem] lg:h-[36rem]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="absolute inset-0">
        {current.bannerImage ? (
          // Banner 16:9 ad alta risoluzione: full-bleed nitido.
          <img
            src={current.bannerImage}
            alt=""
            className="h-full w-full object-cover object-center"
            loading="eager"
          />
        ) : current.coverImage ? (
          // Niente banner: backdrop poster sfocato (mai upscaling) + poster nitido su lg+.
          <>
            <img
              src={current.coverImage}
              alt=""
              aria-hidden
              className="h-full w-full scale-110 object-cover blur-2xl brightness-[0.55]"
              loading="eager"
            />
            <img
              src={current.coverImage}
              alt=""
              className="absolute right-14 top-1/2 hidden h-[72%] -translate-y-1/2 rounded-xl object-contain shadow-2xl lg:block"
              loading="eager"
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-background" />
        )}
        <div className="absolute inset-0 bg-black/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      </div>

      <div className="relative flex h-full items-end px-6 pb-10 md:px-10 md:pb-12 lg:px-14">
        <div className="max-w-2xl space-y-3 md:space-y-4 lg:max-w-[58%]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className="gap-1 border-0 bg-primary text-primary-foreground shadow-sm"
            >
              <Sparkles className="h-3 w-3" />
              In evidenza
            </Badge>
            {current.score != null ? (
              <Badge
                variant="outline"
                className="gap-1 border-white/30 bg-black/30 text-white backdrop-blur-sm"
              >
                <Star className="h-3 w-3 fill-current" />
                {(current.score / 10).toFixed(1)}
              </Badge>
            ) : null}
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white drop-shadow-md md:text-5xl lg:text-6xl">
            {current.titleIta ?? current.title}
          </h1>

          <p className="text-sm text-white/90 drop-shadow md:text-base">
            {current.type}
            {current.seasonYear ? ` · ${current.seasonYear}` : ''}
            {current.season && current.seasonYear ? ` · ${SEASON_LABELS[current.season]}` : ''}
          </p>

          {current.genres.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {current.genres.slice(0, 4).map((genre) => (
                <Badge
                  key={genre.slug}
                  variant="outline"
                  className="border-white/30 bg-black/30 text-white backdrop-blur-sm"
                >
                  {genre.name}
                </Badge>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3 pt-1">
            <Button asChild className="gap-2 shadow-lg">
              <Link href={`/catalog/${current.slug}`}>
                <Play className="h-4 w-4" />
                Vai al dettaglio
              </Link>
            </Button>
            <Button
              variant="outline"
              asChild
              className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white backdrop-blur-sm"
            >
              <Link href="/catalog">Esplora il catalogo</Link>
            </Button>
          </div>
        </div>
      </div>

      {anime.length > 1 ? (
        <>
          <button
            type="button"
            onClick={() => setIndex((prev) => (prev - 1 + anime.length) % anime.length)}
            className="absolute left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/60 md:flex"
            aria-label="Hero precedente"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setIndex((prev) => (prev + 1) % anime.length)}
            className="absolute right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/60 md:flex"
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
                  i === index ? 'w-6 bg-primary' : 'w-2 bg-white/60 hover:bg-white'
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

  const utils = trpc.useUtils();
  const week = trpc.calendar.week.useQuery();
  const seasonal = trpc.catalog.bySeason.useQuery({ season, year, page: 1 });
  const topRated = trpc.catalog.topRated.useQuery({ page: 1 });
  const recent = trpc.catalog.recent.useQuery({ page: 1 });
  const latestEpisodes = trpc.home.latestEpisodes.useQuery();
  const featured = trpc.home.featured.useQuery();
  const continueWatching = trpc.me.history.useQuery();
  const news = trpc.home.news.useQuery();
  const config = trpc.config.getAll.useQuery();

  const todayAnime = week.data?.find((entry) => entry.day === todayWeekday)?.anime ?? [];

  // Ordine e visibilità delle sezioni dalla config (merge col registro per nuove sezioni).
  const order = resolveHomeOrder(config.data?.homeLayout ?? []);

  // Una sezione = un nodo. Section/SectionBlock ritornano già null se vuote/caricamento → nessun
  // buco. "In onda oggi"/"Stagione in corso" sono full-width (non più nella griglia a 2 colonne):
  // a piena larghezza il carosello default non si accavalla (lo Step 4 le riduceva solo perché a
  // mezza larghezza).
  const sectionNodes: Record<HomeSectionId, ReactNode> = {
    hero: <HeroCarousel anime={featured.data ?? []} isLoading={featured.isLoading} />,
    latestEpisodes: (
      <SectionBlock
        title="Ultimi episodi"
        icon={Play}
        isLoading={latestEpisodes.isLoading}
        isEmpty={(latestEpisodes.data ?? []).length === 0}
      >
        <EpisodeGrid episodes={(latestEpisodes.data ?? []).slice(0, 10)} />
      </SectionBlock>
    ),
    continueWatching: (
      <SectionBlock
        title="Continua a guardare"
        icon={Clock}
        isLoading={continueWatching.isLoading}
        isEmpty={(continueWatching.data ?? []).length === 0}
      >
        <ContinueWatchingGrid entries={(continueWatching.data ?? []).slice(0, 12)} />
      </SectionBlock>
    ),
    onAirToday: (
      <Section
        title="In onda oggi"
        icon={Calendar}
        items={todayAnime}
        isLoading={week.isLoading}
        href="/calendar"
      />
    ),
    currentSeason: (
      <Section
        title={`Stagione in corso · ${SEASON_LABELS[season]} ${year}`}
        icon={Calendar}
        items={seasonal.data?.data ?? []}
        isLoading={seasonal.isLoading}
        href={`/catalog?season=${season}&year=${year}`}
        loadMore={(page) => utils.catalog.bySeason.fetch({ season, year, page })}
      />
    ),
    topRated: (
      <Section
        title="Più votati"
        icon={TrendingUp}
        items={topRated.data?.data ?? []}
        isLoading={topRated.isLoading}
        loadMore={(page) => utils.catalog.topRated.fetch({ page })}
      />
    ),
    recentlyAdded: (
      <Section
        title="Ultimi aggiunti"
        icon={Clock}
        items={recent.data?.data ?? []}
        isLoading={recent.isLoading}
        loadMore={(page) => utils.catalog.recent.fetch({ page })}
      />
    ),
    news: (
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
    ),
  };

  return (
    <div className="space-y-14">
      {order
        .filter((entry) => entry.visible)
        .map((entry) => (
          <Fragment key={entry.id}>{sectionNodes[entry.id]}</Fragment>
        ))}
    </div>
  );
}
