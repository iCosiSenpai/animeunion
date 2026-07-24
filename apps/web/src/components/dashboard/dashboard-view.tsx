'use client';

import { AnimeCard } from '@/components/anime/anime-card';
import { SectionPanel } from '@/components/dashboard/section-panel';
import { Sortable, SortableItem } from '@/components/dashboard/sortable';
import { StatCard } from '@/components/dashboard/stat-card';
import { StatusPill } from '@/components/dashboard/status-pill';
import { type StatusTone, TONES } from '@/components/dashboard/tone';
import { CardCarousel, CardCarouselSkeleton } from '@/components/home/card-carousel';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { useDownloadSummary } from '@/lib/use-download-summary';
import { cn, formatDate } from '@/lib/utils';
import type { AnimeSummary, NotificationType, Season, WeekDay } from '@animeunion/shared';
import { rectSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Columns2,
  Compass,
  Cpu,
  Download,
  DownloadCloud,
  Eye,
  EyeOff,
  HardDrive,
  Heart,
  Library,
  ListChecks,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type ComponentType,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

const GB = 1024 ** 3;

const WIDGET_IDS = [
  'queue',
  'recent',
  'storage',
  'neural',
  'catalog',
  'upcoming',
  'doctor',
  'activity',
] as const;
const BAND_IDS = ['follows', 'onair', 'seasonal', 'topRated'] as const;

const WIDGET_LABELS: Record<string, string> = {
  queue: 'Coda download',
  recent: 'Ultimi scaricati',
  storage: 'Archiviazione',
  neural: 'Worker neurale',
  catalog: 'Catalogo',
  upcoming: 'Prossimi episodi',
  doctor: 'Diagnostica',
  activity: 'Attività recente',
};
const BAND_LABELS: Record<string, string> = {
  follows: 'I tuoi seguiti',
  onair: 'In onda oggi',
  seasonal: 'Da scoprire',
  topRated: 'Più votati',
};

type Density = 'comfortable' | 'compact';
interface DashboardLayout {
  widgets: string[];
  bands: string[];
  hidden: string[];
  wide: string[];
  density: Density;
}
const DEFAULT_LAYOUT: DashboardLayout = {
  widgets: [...WIDGET_IDS],
  bands: [...BAND_IDS],
  hidden: [],
  wide: [],
  density: 'comfortable',
};

function orderMerge(saved: unknown, all: readonly string[]): string[] {
  const known = new Set(all);
  const base = Array.isArray(saved) ? (saved as string[]).filter((id) => known.has(id)) : [];
  for (const id of all) {
    if (!base.includes(id)) {
      base.push(id);
    }
  }
  return base;
}
function mergeLayout(saved: Partial<DashboardLayout> | null): DashboardLayout {
  const allIds = new Set<string>([...WIDGET_IDS, ...BAND_IDS]);
  const widgetIds = new Set<string>(WIDGET_IDS);
  return {
    widgets: orderMerge(saved?.widgets, WIDGET_IDS),
    bands: orderMerge(saved?.bands, BAND_IDS),
    hidden: Array.isArray(saved?.hidden)
      ? (saved?.hidden as string[]).filter((id) => allIds.has(id))
      : [],
    wide: Array.isArray(saved?.wide)
      ? (saved?.wide as string[]).filter((id) => widgetIds.has(id))
      : [],
    density: saved?.density === 'compact' ? 'compact' : 'comfortable',
  };
}
function parseLayout(json: string | undefined): DashboardLayout {
  if (!json) {
    return mergeLayout(null);
  }
  try {
    return mergeLayout(JSON.parse(json) as Partial<DashboardLayout>);
  } catch {
    return mergeLayout(null);
  }
}

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
const WEEK_ORDER: WeekDay[] = [
  'LUNEDI',
  'MARTEDI',
  'MERCOLEDI',
  'GIOVEDI',
  'VENERDI',
  'SABATO',
  'DOMENICA',
];
const DAY_LABELS: Record<WeekDay, string> = {
  LUNEDI: 'Lun',
  MARTEDI: 'Mar',
  MERCOLEDI: 'Mer',
  GIOVEDI: 'Gio',
  VENERDI: 'Ven',
  SABATO: 'Sab',
  DOMENICA: 'Dom',
};
const JS_DAY_TO_WEEKDAY: WeekDay[] = [
  'DOMENICA',
  'LUNEDI',
  'MARTEDI',
  'MERCOLEDI',
  'GIOVEDI',
  'VENERDI',
  'SABATO',
];

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
 * Dashboard "centro di controllo" ibrida e personalizzabile: KPI + widget di stato + bande di anime,
 * riordinabili (⠿) e configurabili (mostra/nascondi, larghezza 1/2 colonne, densità), con layout
 * salvato lato server (segue l'utente tra dispositivi). Legge solo dati già esposti via tRPC.
 */
export function DashboardView() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const health = trpc.health.status.useQuery(undefined, { refetchInterval: 15000, retry: false });
  const neural = trpc.neuralExport.status.useQuery(undefined, { retry: false });
  const jobs = trpc.neuralExport.jobs.useQuery(undefined, { refetchInterval: 8000, retry: false });
  const doctor = trpc.doctor.state.useQuery(undefined, { refetchInterval: 30000, retry: false });
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
  const configQuery = trpc.config.getAll.useQuery(undefined, { staleTime: 60_000 });

  const sync = trpc.catalog.sync.useMutation({
    onSuccess: () => {
      toast.success('Sincronizzazione catalogo avviata');
      void utils.health.status.invalidate();
    },
    onError: (e) => toast.error(e.message || 'Sincronizzazione non riuscita'),
  });
  const setConfig = trpc.config.set.useMutation({
    onError: (e) => toast.error(e.message || 'Salvataggio layout non riuscito'),
  });

  // Layout dal server (config.dashboardLayout). Init una volta sola: il primo render usa i default
  // (SSR-safe), poi l'effetto applica il valore salvato.
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const inited = useRef(false);
  useEffect(() => {
    if (!inited.current && configQuery.data) {
      inited.current = true;
      setLayout(parseLayout(configQuery.data.dashboardLayout));
    }
  }, [configQuery.data]);

  const saveLayout = useCallback(
    (next: DashboardLayout) => {
      setLayout(next);
      setConfig.mutate({ key: 'dashboardLayout', value: JSON.stringify(next) });
    },
    [setConfig],
  );

  const hidden = new Set(layout.hidden);
  const wide = new Set(layout.wide);
  const dense = layout.density === 'compact';
  const visibleWidgets = layout.widgets.filter((id) => !hidden.has(id));
  const visibleBands = layout.bands.filter((id) => !hidden.has(id));

  const reorderWidgets = (nextVisible: string[]): void =>
    saveLayout({
      ...layout,
      widgets: [...nextVisible, ...layout.widgets.filter((id) => hidden.has(id))],
    });
  const reorderBands = (nextVisible: string[]): void =>
    saveLayout({
      ...layout,
      bands: [...nextVisible, ...layout.bands.filter((id) => hidden.has(id))],
    });
  const toggleHidden = (id: string): void => {
    const next = new Set(layout.hidden);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    saveLayout({ ...layout, hidden: [...next] });
  };
  const toggleWide = (id: string): void => {
    const next = new Set(layout.wide);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    saveLayout({ ...layout, wide: [...next] });
  };

  const onSearch = (e: FormEvent): void => {
    e.preventDefault();
    const q = query.trim();
    if (q) {
      router.push(`/catalog?q=${encodeURIComponent(q)}`);
    }
  };

  const downloading = (counts?.downloading ?? 0) + (counts?.processing ?? 0);
  const queued = counts?.queued ?? 0;
  const failed = counts?.failed ?? 0;

  const dirs = (health.data?.dirs ?? []).filter((d) => d.configured);
  const primaryFree = dirs.find((d) => d.freeBytes != null)?.freeBytes ?? null;
  const diskLow = primaryFree != null && primaryFree < 5 * GB;

  const catalog = health.data?.catalog;
  const w = neural.data?.worker;
  const activeJobs = (jobs.data ?? []).filter((j) => j.state === 'queued' || j.state === 'running');

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
  } else if (failed > 0 || diskLow || doctor.data?.healthy === false) {
    overallTone = 'warning';
    overallLabel = 'Da controllare';
  }

  const recent = (notifications.data ?? []).slice(0, 6);
  const followItems = (follows.data ?? []).map((f) => f.anime).slice(0, 6);
  const todayAnime = (week.data?.find((e) => e.day === todayWeekday)?.anime ?? []).slice(0, 6);
  const seasonalItems = (seasonal.data?.data ?? []).slice(0, 6);
  const topItems = (topRated.data?.data ?? []).slice(0, 6);

  const recentDownloads = (library.data ?? [])
    .flatMap((g) => g.entries.flatMap((e) => e.episodes.map((ep) => ({ anime: g.anime, ep }))))
    .filter((x) => x.ep.downloadedAt)
    .sort((a, b) => (b.ep.downloadedAt ?? '').localeCompare(a.ep.downloadedAt ?? ''))
    .slice(0, 5);

  // Prossimi episodi: dalla settimana, a partire da oggi in avanti.
  const startIdx = Math.max(0, WEEK_ORDER.indexOf(todayWeekday));
  const byDay = new Map((week.data ?? []).map((e) => [e.day, e.anime]));
  const upcoming: {
    anime: AnimeSummary;
    day: WeekDay;
    airTime: string | null;
    episodeNumber: number | null;
  }[] = [];
  for (let i = 0; i < 7 && upcoming.length < 5; i++) {
    const day = WEEK_ORDER[(startIdx + i) % 7];
    if (!day) {
      continue;
    }
    for (const item of byDay.get(day) ?? []) {
      upcoming.push({ anime: item, day, airTime: item.airTime, episodeNumber: item.episodeNumber });
      if (upcoming.length >= 5) {
        break;
      }
    }
  }

  function renderWidget(id: string, handle: ReactNode): ReactNode {
    switch (id) {
      case 'queue':
        return (
          <SectionPanel
            handle={handle}
            dense={dense}
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
            dense={dense}
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
            dense={dense}
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
              <ul className="space-y-3">
                {dirs.map((d) => {
                  const used =
                    d.totalBytes != null && d.freeBytes != null ? d.totalBytes - d.freeBytes : null;
                  const pct =
                    d.totalBytes && used != null
                      ? Math.min(100, Math.max(0, (used / d.totalBytes) * 100))
                      : null;
                  const barTone =
                    pct == null
                      ? 'bg-primary'
                      : pct > 90
                        ? 'bg-destructive'
                        : pct > 75
                          ? 'bg-warning'
                          : 'bg-primary';
                  return (
                    <li key={d.key} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">{d.label}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatBytes(d.freeBytes)} liberi
                          {d.totalBytes ? ` / ${formatBytes(d.totalBytes)}` : ''}
                        </span>
                      </div>
                      {pct != null ? (
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn('h-full rounded-full', barTone)}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionPanel>
        );
      case 'neural': {
        const running = activeJobs.find((j) => j.state === 'running') ?? activeJobs[0];
        return (
          <SectionPanel
            handle={handle}
            dense={dense}
            title="Worker neurale"
            icon={<Cpu className="h-4 w-4" />}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/settings?section=downloadNeurale">Gestisci</Link>
              </Button>
            }
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Stato</span>
              <StatusPill tone={neuralTone} label={neuralLabel} pulse={neuralLabel === 'Pronto'} />
            </div>
            {w?.name ? <p className="mt-2 truncate text-sm">{w.name}</p> : null}
            {activeJobs.length > 0 ? (
              <div className="mt-3 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Upscale in corso</span>
                  <span className="tabular-nums">{activeJobs.length} job</span>
                </div>
                {running ? (
                  <>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{ width: `${Math.round((running.progress ?? 0) * 100)}%` }}
                      />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {running.animeTitle ?? 'Episodio'}
                      {running.episodeNumber != null ? ` · Ep. ${running.episodeNumber}` : ''} ·{' '}
                      {running.quality}
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}
          </SectionPanel>
        );
      }
      case 'catalog':
        return (
          <SectionPanel
            handle={handle}
            dense={dense}
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
      case 'upcoming':
        return (
          <SectionPanel
            handle={handle}
            dense={dense}
            title="Prossimi episodi"
            icon={<CalendarClock className="h-4 w-4" />}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/calendar">Calendario</Link>
              </Button>
            }
          >
            {week.isLoading ? (
              <p className="text-sm text-muted-foreground">Carico…</p>
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun episodio in programma.</p>
            ) : (
              <ul className="space-y-2.5">
                {upcoming.map((u) => (
                  <li key={`${u.anime.id}-${u.day}-${u.episodeNumber ?? '?'}`}>
                    <Link
                      href={`/catalog/${u.anime.slug}`}
                      className="group flex items-center gap-3"
                    >
                      <span className="relative h-12 w-9 shrink-0 overflow-hidden rounded bg-muted">
                        {u.anime.coverImage ? (
                          <img
                            src={u.anime.coverImage}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">
                          {u.anime.titleIta ?? u.anime.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {u.episodeNumber != null ? `Ep. ${u.episodeNumber} · ` : ''}
                          {DAY_LABELS[u.day]}
                          {u.airTime ? ` ${u.airTime}` : ''}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionPanel>
        );
      case 'doctor': {
        const critical = (doctor.data?.checks ?? [])
          .filter((c) => c.status === 'critical')
          .slice(0, 4);
        const ok = doctor.data ? doctor.data.healthy : true;
        return (
          <SectionPanel
            handle={handle}
            dense={dense}
            title="Diagnostica"
            icon={<ShieldCheck className="h-4 w-4" />}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/diagnostica">Apri</Link>
              </Button>
            }
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Stato</span>
              {ok ? (
                <StatusPill tone="success" label="Tutto ok" />
              ) : (
                <StatusPill
                  tone="danger"
                  label={`${doctor.data?.criticalCount ?? critical.length} problemi`}
                />
              )}
            </div>
            {critical.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {critical.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                    <div className="min-w-0">
                      <p className="truncate">{c.label}</p>
                      {c.detail ? (
                        <p className="truncate text-xs text-muted-foreground">{c.detail}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </SectionPanel>
        );
      }
      case 'activity':
        return (
          <SectionPanel
            handle={handle}
            dense={dense}
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
    <div className={cn(dense ? 'space-y-4' : 'space-y-6')}>
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">Centro di controllo</h1>
            <StatusPill tone={overallTone} label={overallLabel} pulse={downloading > 0} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Stato del server AnimeUnion
            {health.data?.version ? ` · v${health.data.version}` : ''}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <form onSubmit={onSearch} className="relative hidden md:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca un anime…"
              aria-label="Cerca un anime nel catalogo"
              className="h-9 w-52 rounded-lg border bg-background pl-8 pr-3 text-sm outline-none transition-colors focus:border-primary"
            />
          </form>
          <Button
            variant={editing ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={() => setEditing((v) => !v)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {editing ? 'Fatto' : 'Personalizza'}
          </Button>
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

      {editing ? (
        <div className="space-y-4 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Personalizza dashboard</h2>
              <p className="text-xs text-muted-foreground">
                Trascina ⠿ per riordinare. Il layout è salvato sul server e ti segue tra
                dispositivi.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => saveLayout(DEFAULT_LAYOUT)}
            >
              <RotateCcw className="h-4 w-4" />
              Ripristina
            </Button>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Densità</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={dense ? 'outline' : 'default'}
                onClick={() => saveLayout({ ...layout, density: 'comfortable' })}
              >
                Comoda
              </Button>
              <Button
                size="sm"
                variant={dense ? 'default' : 'outline'}
                onClick={() => saveLayout({ ...layout, density: 'compact' })}
              >
                Compatta
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Widget</p>
              <ul className="space-y-1">
                {layout.widgets.map((id) => (
                  <li key={id} className="flex items-center gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => toggleHidden(id)}
                      aria-label={hidden.has(id) ? 'Mostra' : 'Nascondi'}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {hidden.has(id) ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate',
                        hidden.has(id) && 'text-muted-foreground line-through',
                      )}
                    >
                      {WIDGET_LABELS[id] ?? id}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleWide(id)}
                      aria-label={wide.has(id) ? 'Larghezza normale' : 'Larghezza doppia'}
                      title="1 o 2 colonne"
                      className="rounded p-1 transition-colors hover:bg-accent"
                    >
                      <Columns2
                        className={cn(
                          'h-4 w-4',
                          wide.has(id) ? 'text-primary' : 'text-muted-foreground',
                        )}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Bande</p>
              <ul className="space-y-1">
                {layout.bands.map((id) => (
                  <li key={id} className="flex items-center gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => toggleHidden(id)}
                      aria-label={hidden.has(id) ? 'Mostra' : 'Nascondi'}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {hidden.has(id) ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate',
                        hidden.has(id) && 'text-muted-foreground line-through',
                      )}
                    >
                      {BAND_LABELS[id] ?? id}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {/* KPI: il cuore del centro di download */}
      <div className={cn('grid grid-cols-2 lg:grid-cols-4', dense ? 'gap-3' : 'gap-4')}>
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

      {/* Widget di stato: griglia riordinabile + larghezza personalizzabile */}
      <Sortable
        ids={visibleWidgets}
        onReorder={reorderWidgets}
        strategy={rectSortingStrategy}
        className={cn('grid sm:grid-cols-2 xl:grid-cols-3', dense ? 'gap-3' : 'gap-4')}
      >
        {visibleWidgets.map((id) => (
          <SortableItem key={id} id={id} className={wide.has(id) ? 'sm:col-span-2' : undefined}>
            {(handle) => renderWidget(id, handle)}
          </SortableItem>
        ))}
      </Sortable>

      {/* Bande anime (ibrido): lista riordinabile */}
      <Sortable
        ids={visibleBands}
        onReorder={reorderBands}
        strategy={verticalListSortingStrategy}
        className={cn('border-t', dense ? 'space-y-5 pt-6' : 'space-y-8 pt-8')}
      >
        {visibleBands.map((id) => (
          <SortableItem key={id} id={id}>
            {(handle) => renderBand(id, handle)}
          </SortableItem>
        ))}
      </Sortable>
    </div>
  );
}
