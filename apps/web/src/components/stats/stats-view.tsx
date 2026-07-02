'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { trpc } from '@/lib/trpc';
import { formatBytes } from '@/lib/utils';
import type { DashboardStats } from '@animeunion/shared';
import {
  AlertCircle,
  CheckCircle2,
  Clapperboard,
  Download,
  HardDrive,
  Heart,
  ListVideo,
} from 'lucide-react';
import type { ReactNode } from 'react';

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        {/* Niente `truncate`: un numero non va mai tagliato con "…". Se lo spazio è poco il valore
            rimpicciolisce (text-xl su schermi stretti) e, in ultima istanza, va a capo invece di
            perdere cifre. `tabular-nums` mantiene le cifre allineate. */}
        <p className="text-xl font-bold tabular-nums [overflow-wrap:anywhere] sm:text-2xl">
          {value}
        </p>
        <p className="text-sm text-muted-foreground">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </Card>
  );
}

function ProgressRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value.toLocaleString('it-IT')} / {total.toLocaleString('it-IT')} ({pct}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function num(n: number): string {
  return n.toLocaleString('it-IT');
}

function Loaded({ data }: { data: DashboardStats }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          icon={<Clapperboard className="h-5 w-5" />}
          label="Anime a catalogo"
          value={num(data.totalAnime)}
        />
        <StatCard
          icon={<ListVideo className="h-5 w-5" />}
          label="Episodi totali"
          value={num(data.totalEpisodes)}
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Episodi scaricati"
          value={num(data.downloadedEpisodes)}
        />
        <StatCard
          icon={<Heart className="h-5 w-5" />}
          label="Anime seguiti"
          value={num(data.followedAnime)}
        />
        <StatCard
          icon={<HardDrive className="h-5 w-5" />}
          label="Spazio occupato"
          value={formatBytes(data.totalSizeBytes)}
        />
        <StatCard
          icon={<Download className="h-5 w-5" />}
          label="In coda"
          value={num(data.downloadQueueSize)}
        />
      </div>

      <Card className="space-y-4 p-5">
        <h2 className="text-lg font-semibold">Avanzamento</h2>
        <ProgressRow
          label="Episodi scaricati"
          value={data.downloadedEpisodes}
          total={data.totalEpisodes}
        />
      </Card>
    </div>
  );
}

export function StatsView() {
  const stats = trpc.stats.dashboard.useQuery(undefined, { refetchInterval: 30000 });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Panoramica"
        title="Statistiche"
        description="Una panoramica di catalogo, download e spazio occupato."
      />

      {stats.isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Impossibile caricare le statistiche"
          description="Controlla la connessione e riprova."
          action={
            <Button variant="outline" onClick={() => stats.refetch()}>
              Riprova
            </Button>
          }
        />
      ) : stats.isLoading || !stats.data ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {['s1', 's2', 's3', 's4', 's5', 's6'].map((k) => (
            <Card key={k} className="h-24 animate-pulse bg-muted" />
          ))}
        </div>
      ) : (
        <Loaded data={stats.data} />
      )}
    </div>
  );
}
