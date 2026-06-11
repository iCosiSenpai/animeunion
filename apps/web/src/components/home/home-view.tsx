'use client';

import { AnimeGrid, AnimeGridSkeleton } from '@/components/anime/anime-grid';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import type { AnimeSummary, Season } from '@animeunion/shared';
import Link from 'next/link';

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

function Section({
  title,
  items,
  isLoading,
  href,
}: {
  title: string;
  items: AnimeSummary[];
  isLoading: boolean;
  href?: string;
}) {
  if (!isLoading && items.length === 0) {
    return null;
  }
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{title}</h2>
        {href ? (
          <Link href={href} className="text-sm text-muted-foreground hover:text-foreground">
            Vedi tutto
          </Link>
        ) : null}
      </div>
      {isLoading ? <AnimeGridSkeleton count={6} /> : <AnimeGrid anime={items.slice(0, 12)} />}
    </section>
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

  const todayAnime = week.data?.find((entry) => entry.day === todayWeekday)?.anime ?? [];

  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">AnimeUnion</h1>
        <p className="text-muted-foreground">Scopri, segui e scarica i tuoi anime preferiti.</p>
      </div>

      <Section
        title="In onda oggi"
        items={todayAnime}
        isLoading={week.isLoading}
        href="/calendar"
      />
      <Section
        title={`Stagione in corso · ${SEASON_LABELS[season]} ${year}`}
        items={seasonal.data?.data ?? []}
        isLoading={seasonal.isLoading}
        href={`/catalog?season=${season}&year=${year}`}
      />
      <Section
        title="Più votati"
        items={topRated.data?.data ?? []}
        isLoading={topRated.isLoading}
      />
      <Section
        title="Ultimi aggiunti"
        items={recent.data?.data ?? []}
        isLoading={recent.isLoading}
      />

      <div className="flex justify-center">
        <Button asChild>
          <Link href="/catalog">Esplora il catalogo</Link>
        </Button>
      </div>
    </div>
  );
}
