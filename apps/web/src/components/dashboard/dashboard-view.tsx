'use client';

import { AnimeCard } from '@/components/anime/anime-card';
import { SectionPanel } from '@/components/dashboard/section-panel';
import { Sortable, SortableItem, useLayoutOrder } from '@/components/dashboard/sortable';
import { StatCard } from '@/components/dashboard/stat-card';
import { StatusPill } from '@/components/dashboard/status-pill';
import { type StatusTone, TONES } from '@/components/dashboard/tone';
import { CardCarousel, CardCarouselSkeleton } from '@/components/home/card-carousel';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { useDownloadSummary } from '@/lib/use-download-summary';
import { cn, formatDate } from '@/lib/utils';
import type { AnimeSummary, NotificationType, Season } from '@animeunion/shared';
import { rectSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Cpu,
  Download,
  DownloadCloud,
  HardDrive,
  Heart,
  Library,
  ListChecks,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { toast } from 'sonner';

const GB = 1024 ** 3;

const WIDGET_IDS = ['queue', 'recent', 'storage', 'neural', 'catalog', 'activity'] as const;
const BAND_IDS = ['follows', 'onair', 'seasonal', 'topRated'] as const;

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

const NOTIF_META: Record<
  NotificationType,
  { icon: ComponentType<{ className?: string }>; tone: StatusTone }
> = {
  download_complete: { icon: CheckCircle2, tone: 'success' },
  download_failed: { icon: AlertTriangle, tone: 'danger' },
  new_episode: { icon: Activity, tone: 'info' },
  season_available: { icon: Activity, tone: 'info' },
  sync_complete: { icon: RefreshCw, tone: 'info' },
  disk_low: { icon: HardDrive, tone: 'warning' },
  doctor_alert: { icon: Activity, tone: 'warning' },
  doctor_resolved: { icon: CheckCircle2, tone: 'success' },
  info: { icon: Activity, tone: 'neutral' },
};

function formatBytes(n: number | null | undefined): string {
  if (n == null) {
    return 'n/d';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Header di una banda anime: impugnatura + icona + titolo + "Vedi tutto". */
function Band({
  handle,
  icon: Icon,
  title,
  href,
  children,
}: {
  handle: ReactNode;
  icon: ComponentType<{ className?: string }>;
  title: string;
  href?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {handle}
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        </div>
        {href ? (
          <Link
            href={href}
            className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Vedi tutto <ChevronRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function animeRow(items: AnimeSummary[], isLoading: boolean, emptyText: ReactNode): ReactNode {
  if (isLoading) {
    return <CardCarouselSkeleton count={6} />;
  }
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <CardCarousel>
      {items.map((a) => (
        <AnimeCard key={a.id} anime={a} />
      ))}
    </CardCarousel>
  );
}

/**
 * Dashboard "centro di controllo" ibrida e personalizzabile: in alto i KPI, poi una griglia di
 * widget di stato del server e delle bande di anime — entrambi riordinabili via drag & drop
 * (impugnatura ⠿) con ordine salvato in locale. Legge solo dati già esposti via tRPC.
 */
export function DashboardView() {
  const utils = trpc.useUtils();
  const health = trpc.health.status.useQuery(undefined, { refetchInterval: 15000, retry: false });
  const neural = trpc.neuralExport.status.useQuery(undefined, { retry: false });
  const notifications = trpc.notifications.list.useQuery(undefined, { refetchInterval: 30000 });
  const { counts } = useDownloadSummary();

  const now = new Date();
  const season = SEASON_BY_MONTH[now.getMonth()] ?? 'WINTER';
  const year = now.getFullYear();
  const todayWeekday = JS_DAY_TO_WEEKDAY[now.getDay()] ?? 'LUNEDI';

  const follows = trpc.follow.list.useQuery();
  const week = trpc.calendar.week.useQuery();
  const seasonal = trpc.catalog.bySeason.useQuery({ season, year, page: 1 });
  const topRated = trpc.catalog.topRated.useQuery({ page: 1 });
  const library = trpc.library.list.useQuery(undefined, { staleTime: 60_000, retry: false });

  const sync = trpc.catalog.sync.useMutation({
    onSuccess: () => {
      toast.success('Sincronizzazione catalogo avviata');
      void utils.health.status.invalidate();
    },
    onError: (e) => toast.error(e.message || 'Sincronizzazione non riuscita'),
  });

  const [widgetOrder, setWidgetOrder] = useLayoutOrder('dashboard.widgets.v1', WIDGET_IDS);
  const [bandOrder, setBandOrder] = useLayoutOrder('dashboard.bands.v1', BAND_IDS);

  const downloading = (counts?.downloading ?? 0) + (counts?.processing ?? 0);
  const queued = counts?.queued ?? 0;
  const failed = counts?.failed ?? 0;

  const dirs = (health.data?.dirs ?? []).filter((d) => d.configured);
  const primaryFree = dirs.find((d) => d.freeBytes != null)?.freeBytes ?? null;
  const diskLow = primaryFree != null && primaryFree < 5 * GB;

  const catalog = health.data?.catalog;
  const w = neural.data?.worker;

  let neuralTone: StatusTone = 'neutral';
  let neuralLabel = 'Non collegato';
  if (w?.reachable && w.ffmpegCapable && w.enabled) {
    neuralTone = 'success';
    neuralLabel = 'Pronto';
  } else if (w?.configured && !w.reachable) {
    neuralTone = 'warning';
    neuralLabel = 'Non raggiungibile';
  } else if (w?.configured && !w.enabled) {
    neuralTone = 'neutral';
    neuralLabel = 'Disattivato';
  } else if (w?.configured) {
    neuralTone = 'warning';
    neuralLabel = 'Da verificare';
  }

  let overallTone: StatusTone = 'success';
  let overallLabel = 'In salute';
  if (downloading > 0) {
    overallTone = 'info';
    overallLabel = 'Operativo';
  } else if (failed > 0 || diskLow) {
    overallTone = 'warning';
    overallLabel = 'Da controllare';
  }

  const recent = (notifications.data ?? []).slice(0, 6);
  const followItems = (follows.data ?? []).map((f) => f.anime).slice(0, 6);
  const todayAnime = (week.data?.find((e) => e.day === todayWeekday)?.anime ?? []).slice(0, 6);
  const seasonalItems = (seasonal.data?.data ?? []).slice(0, 6);
  const topItems = (topRated.data?.data ?? []).slice(0, 6);

  // "Ultimi scaricati": appiattisce la libreria a episodi, ordina per data di download desc.
  const recentDownloads = (library.data ?? [])
    .flatMap((g) => g.entries.flatMap((e) => e.episodes.map((ep) => ({ anime: g.anime, ep }))))
    .filter((x) => x.ep.downloadedAt)
    .sort((a, b) => (b.ep.downloadedAt ?? '').localeCompare(a.ep.downloadedAt ?? ''))
    .slice(0, 5);

  function renderWidget(id: string, handle: ReactNode): ReactNode {
    switch (id) {
      case 'queue':
        return (
          <SectionPanel
            handle={handle}
            title="Coda download"
            icon={<Download className="h-4 w-4" />}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/downloads">Apri</Link>
              </Button>
            }
          >
            <div className="flex flex-wrap gap-2">
              <StatusPill
                tone="info"
                label={`${counts?.downloading ?? 0} in download`}
                pulse={(counts?.downloading ?? 0) > 0}
              />
              <StatusPill tone="primary" label={`${counts?.processing ?? 0} in elaborazione`} />
              <StatusPill tone="neutral" label={`${queued} in coda`} />
              <StatusPill tone={failed > 0 ? 'danger' : 'neutral'} label={`${failed} falliti`} />
            </div>
          </SectionPanel>
        );
      case 'recent':
        return (
          <SectionPanel
            handle={handle}
            title="Ultimi scaricati"
            icon={<DownloadCloud className="h-4 w-4" />}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/library">Libreria</Link>
              </Button>
            }
          >
            {library.isLoading ? (
              <p className="text-sm text-muted-foreground">Carico…</p>
            ) : recentDownloads.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun download recente.</p>
            ) : (
              <ul className="space-y-2.5">
                {recentDownloads.map(({ anime, ep }) => (
                  <li key={ep.episodeFileId}>
                    <Link href={`/catalog/${anime.slug}`} className="group flex items-center gap-3">
                      <span className="relative h-12 w-9 shrink-0 overflow-hidden rounded bg-muted">
                        {anime.coverImage ? (
                          <img
                            src={anime.coverImage}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">
                          {anime.titleIta ?? anime.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          Ep. {ep.episodeNumber} · {ep.language === 'DUB_ITA' ? 'DUB' : 'SUB'}
                          {ep.downloadedAt ? ` · ${formatDate(ep.downloadedAt)}` : ''}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionPanel>
        );
      case 'storage':
        return (
          <SectionPanel
            handle={handle}
            title="Archiviazione"
            icon={<HardDrive className="h-4 w-4" />}
          >
            {dirs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessuna cartella configurata.{' '}
                <Link href="/settings" className="text-primary hover:underline">
                  Configura
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-2.5">
                {dirs.map((d) => (
                  <li key={d.key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{d.label}</span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatBytes(d.freeBytes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionPanel>
        );
      case 'neural':
        return (
          <SectionPanel handle={handle} title="Worker neurale" icon={<Cpu className="h-4 w-4" />}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Stato</span>
              <StatusPill tone={neuralTone} label={neuralLabel} pulse={neuralLabel === 'Pronto'} />
            </div>
            {w?.name ? <p className="mt-2 truncate text-sm">{w.name}</p> : null}
            <Button asChild variant="ghost" size="sm" className="mt-1 -ml-2">
              <Link href="/settings?section=downloadNeurale">Gestisci</Link>
            </Button>
          </SectionPanel>
        );
      case 'catalog':
        return (
          <SectionPanel
            handle={handle}
            title="Catalogo"
            icon={<Library className="h-4 w-4" />}
            action={
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                disabled={sync.isPending || catalog?.running}
                onClick={() => sync.mutate()}
              >
                <RefreshCw
                  className={cn('h-4 w-4', (sync.isPending || catalog?.running) && 'animate-spin')}
                />
                Sync
              </Button>
            }
          >
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Anime indicizzati</span>
              <span className="text-lg font-semibold tabular-nums">
                {catalog?.totalAnime ?? '—'}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Ultima sync</span>
              {catalog?.running ? (
                <StatusPill tone="info" label="In corso" pulse />
              ) : (
                <span className="text-sm">
                  {catalog?.lastSyncedAt ? formatDate(catalog.lastSyncedAt) : 'mai'}
                </span>
              )}
            </div>
          </SectionPanel>
        );
      case 'activity':
        return (
          <SectionPanel
            handle={handle}
            title="Attività recente"
            icon={<Activity className="h-4 w-4" />}
          >
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna attività recente.</p>
            ) : (
              <ul className="space-y-2.5">
                {recent.map((n) => {
                  const meta = NOTIF_META[n.type] ?? NOTIF_META.info;
                  const Icon = meta.icon;
                  return (
                    <li key={n.id} className="flex items-start gap-2.5">
                      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TONES[meta.tone].text)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{n.title}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(n.createdAt)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionPanel>
        );
      default:
        return null;
    }
  }

  function renderBand(id: string, handle: ReactNode): ReactNode {
    switch (id) {
      case 'follows':
        return (
          <Band handle={handle} icon={Heart} title="I tuoi seguiti" href="/follows">
            {animeRow(
              followItems,
              follows.isLoading,
              <>
                Non segui ancora nessuna serie.{' '}
                <Link href="/catalog" className="text-primary hover:underline">
                  Esplora il catalogo
                </Link>
                .
              </>,
            )}
          </Band>
        );
      case 'onair':
        return (
          <Band handle={handle} icon={CalendarDays} title="In onda oggi" href="/calendar">
            {animeRow(todayAnime, week.isLoading, 'Niente in onda oggi.')}
          </Band>
        );
      case 'seasonal':
        return (
          <Band
            handle={handle}
            icon={Compass}
            title={`Da scoprire · ${SEASON_LABELS[season]} ${year}`}
            href={`/catalog?season=${season}&year=${year}`}
          >
            {animeRow(seasonalItems, seasonal.isLoading, 'Nessun titolo per la stagione.')}
          </Band>
        );
      case 'topRated':
        return (
          <Band handle={handle} icon={TrendingUp} title="Più votati" href="/catalog">
            {animeRow(topItems, topRated.isLoading, 'Nessun dato.')}
          </Band>
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">Centro di controllo</h1>
            <StatusPill tone={overallTone} label={overallLabel} pulse={downloading > 0} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Stato del server AnimeUnion
            {health.data?.version ? ` · v${health.data.version}` : ''} · trascina ⠿ per riordinare
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={sync.isPending || catalog?.running}
            onClick={() => sync.mutate()}
          >
            <RefreshCw
              className={cn('h-4 w-4', (sync.isPending || catalog?.running) && 'animate-spin')}
            />
            Sincronizza
          </Button>
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/downloads">
              <Download className="h-4 w-4" />
              Download
            </Link>
          </Button>
        </div>
      </header>

      {/* KPI: il cuore del centro di download */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="In download"
          value={downloading}
          icon={<Download className="h-5 w-5" />}
          tone={downloading > 0 ? 'info' : 'neutral'}
          hint={downloading > 0 ? 'in corso' : 'inattivo'}
        />
        <StatCard
          label="In coda"
          value={queued}
          icon={<ListChecks className="h-5 w-5" />}
          tone={queued > 0 ? 'primary' : 'neutral'}
        />
        <StatCard
          label="Falliti"
          value={failed}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={failed > 0 ? 'danger' : 'neutral'}
          hint={
            failed > 0 ? (
              <Link href="/downloads" className="hover:underline">
                gestisci
              </Link>
            ) : (
              'nessuno'
            )
          }
        />
        <StatCard
          label="Spazio libero"
          value={formatBytes(primaryFree)}
          icon={<HardDrive className="h-5 w-5" />}
          tone={diskLow ? 'warning' : 'primary'}
          hint={dirs.length > 1 ? `${dirs.length} cartelle` : dirs[0]?.label}
        />
      </div>

      {/* Widget di stato: griglia riordinabile */}
      <Sortable
        ids={widgetOrder}
        onReorder={setWidgetOrder}
        strategy={rectSortingStrategy}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {widgetOrder.map((id) => (
          <SortableItem key={id} id={id}>
            {(handle) => renderWidget(id, handle)}
          </SortableItem>
        ))}
      </Sortable>

      {/* Bande anime (ibrido): lista riordinabile */}
      <Sortable
        ids={bandOrder}
        onReorder={setBandOrder}
        strategy={verticalListSortingStrategy}
        className="space-y-8 border-t pt-8"
      >
        {bandOrder.map((id) => (
          <SortableItem key={id} id={id}>
            {(handle) => renderBand(id, handle)}
          </SortableItem>
        ))}
      </Sortable>
    </div>
  );
}
