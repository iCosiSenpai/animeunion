'use client';

import { AnimeCard } from '@/components/anime/anime-card';
import { SectionPanel } from '@/components/dashboard/section-panel';
import { StatCard } from '@/components/dashboard/stat-card';
import { StatusPill } from '@/components/dashboard/status-pill';
import { type StatusTone, TONES } from '@/components/dashboard/tone';
import { CardCarousel, CardCarouselSkeleton } from '@/components/home/card-carousel';
import { ContinueWatchingGrid } from '@/components/home/continue-watching';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { useDownloadSummary } from '@/lib/use-download-summary';
import { cn, formatDate } from '@/lib/utils';
import type { NotificationType, Season } from '@animeunion/shared';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Cpu,
  Download,
  HardDrive,
  Heart,
  Library,
  ListChecks,
  PlayCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { toast } from 'sonner';

const GB = 1024 ** 3;

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

const NOTIF_META: Record<
  NotificationType,
  { icon: ComponentType<{ className?: string }>; tone: StatusTone }
> = {
  download_complete: { icon: CheckCircle2, tone: 'success' },
  download_failed: { icon: AlertTriangle, tone: 'danger' },
  new_episode: { icon: Sparkles, tone: 'info' },
  season_available: { icon: Sparkles, tone: 'info' },
  sync_complete: { icon: RefreshCw, tone: 'info' },
  disk_low: { icon: HardDrive, tone: 'warning' },
  doctor_alert: { icon: Activity, tone: 'warning' },
  doctor_resolved: { icon: CheckCircle2, tone: 'success' },
  info: { icon: Activity, tone: 'neutral' },
};

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

/** Riga "scorciatoia" di card anime: header leggero (icona + titolo + "Vedi tutto") + contenuto. */
function ContentRow({
  icon: Icon,
  title,
  href,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  href?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
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

/**
 * Dashboard "centro di controllo": stato del server a colpo d'occhio (coda download, archiviazione,
 * worker neurale, catalogo, attività recente). Legge solo dati già esposti via tRPC — nessuna
 * modifica al backend. È la nuova home al posto dei caroselli di scoperta.
 */
export function DashboardView() {
  const utils = trpc.useUtils();
  const health = trpc.health.status.useQuery(undefined, { refetchInterval: 15000, retry: false });
  const neural = trpc.neuralExport.status.useQuery(undefined, { retry: false });
  const notifications = trpc.notifications.list.useQuery(undefined, { refetchInterval: 30000 });
  const { counts } = useDownloadSummary();

  // Contenuti "ibridi": i tuoi anime + scoperta della stagione (accesso rapido dal centro di controllo).
  const now = new Date();
  const season = SEASON_BY_MONTH[now.getMonth()] ?? 'WINTER';
  const year = now.getFullYear();
  const history = trpc.me.history.useQuery();
  const follows = trpc.follow.list.useQuery();
  const seasonal = trpc.catalog.bySeason.useQuery({ season, year, page: 1 });

  const sync = trpc.catalog.sync.useMutation({
    onSuccess: () => {
      toast.success('Sincronizzazione catalogo avviata');
      void utils.health.status.invalidate();
    },
    onError: (e) => toast.error(e.message || 'Sincronizzazione non riuscita'),
  });

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

  const historyItems = (history.data ?? []).slice(0, 6);
  const followItems = (follows.data ?? []).map((f) => f.anime).slice(0, 6);
  const seasonalItems = (seasonal.data?.data ?? []).slice(0, 6);
  const hasContent = historyItems.length > 0 || followItems.length > 0;

  return (
    <div className="space-y-6">
      {/* Header del centro di controllo */}
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

      {/* KPI: la coda download è il cuore del "centro di download" */}
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Colonna principale: coda + archiviazione */}
        <div className="space-y-6 lg:col-span-2">
          <SectionPanel
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
            {downloading === 0 && queued === 0 && failed === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Nessun download in corso. Aggiungi titoli dal catalogo o segui una serie per il
                download automatico.
              </p>
            ) : null}
          </SectionPanel>

          <SectionPanel title="Archiviazione" icon={<HardDrive className="h-4 w-4" />}>
            {dirs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessuna cartella di download configurata.{' '}
                <Link href="/settings" className="text-primary hover:underline">
                  Configura in Impostazioni
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-3">
                {dirs.map((d) => (
                  <li key={d.key} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <HardDrive className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{d.label}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">{d.path}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatBytes(d.freeBytes)}
                      </p>
                      {!d.writable ? (
                        <StatusPill tone="danger" label="Sola lettura" />
                      ) : (
                        <p className="text-xs text-muted-foreground">liberi</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionPanel>
        </div>

        {/* Colonna laterale: worker neurale, catalogo, attività */}
        <div className="space-y-6">
          <SectionPanel title="Worker neurale" icon={<Cpu className="h-4 w-4" />}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Stato</span>
              <StatusPill tone={neuralTone} label={neuralLabel} pulse={neuralLabel === 'Pronto'} />
            </div>
            {w?.name ? (
              <p className="mt-2 truncate text-sm">
                <span className="text-muted-foreground">PC: </span>
                {w.name}
              </p>
            ) : null}
            {w?.url ? (
              <p className="truncate font-mono text-xs text-muted-foreground">{w.url}</p>
            ) : null}
            <Button asChild variant="ghost" size="sm" className="mt-2 -ml-2">
              <Link href="/settings?section=downloadNeurale">Gestisci upscale neurale</Link>
            </Button>
          </SectionPanel>

          <SectionPanel title="Catalogo" icon={<Library className="h-4 w-4" />}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Anime indicizzati</span>
              <span className="text-lg font-semibold tabular-nums">
                {catalog?.totalAnime ?? '—'}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Ultima sync
              </span>
              {catalog?.running ? (
                <StatusPill tone="info" label="In corso" pulse />
              ) : (
                <span className="text-sm">
                  {catalog?.lastSyncedAt ? formatDate(catalog.lastSyncedAt) : 'mai'}
                </span>
              )}
            </div>
          </SectionPanel>

          <SectionPanel title="Attività recente" icon={<Activity className="h-4 w-4" />}>
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
        </div>
      </div>

      {/* Banda contenuti (ibrido): accesso rapido ai tuoi anime + scoperta della stagione */}
      {hasContent || seasonalItems.length > 0 || seasonal.isLoading ? (
        <div className="space-y-8 border-t pt-8">
          {historyItems.length > 0 ? (
            <ContentRow icon={PlayCircle} title="Continua a guardare">
              <ContinueWatchingGrid entries={historyItems} />
            </ContentRow>
          ) : null}
          {followItems.length > 0 ? (
            <ContentRow icon={Heart} title="I tuoi seguiti" href="/follows">
              <CardCarousel>
                {followItems.map((a) => (
                  <AnimeCard key={a.id} anime={a} />
                ))}
              </CardCarousel>
            </ContentRow>
          ) : null}
          <ContentRow
            icon={Compass}
            title={`Da scoprire · ${SEASON_LABELS[season]} ${year}`}
            href={`/catalog?season=${season}&year=${year}`}
          >
            {seasonal.isLoading ? (
              <CardCarouselSkeleton count={6} />
            ) : seasonalItems.length > 0 ? (
              <CardCarousel>
                {seasonalItems.map((a) => (
                  <AnimeCard key={a.id} anime={a} />
                ))}
              </CardCarousel>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nessun titolo per la stagione.{' '}
                <Link href="/catalog" className="text-primary hover:underline">
                  Sfoglia il catalogo
                </Link>
                .
              </p>
            )}
          </ContentRow>
        </div>
      ) : null}
    </div>
  );
}
