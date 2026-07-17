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

function num(n: number): string {
  return n.toLocaleString('it-IT');
}

function StatsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function Loaded({ data }: { data: DashboardStats }) {
  // Totali del catalogo del sito: dall'API ufficiale, non dai conteggi locali (il mirror ha episodi
  // solo per gli anime aperti). Query separata: puo' essere offline → placeholder "—".
  const site = trpc.catalog.siteStats.useQuery(undefined, { staleTime: 5 * 60_000 });
  const catalogValue = (n: number | undefined): string => (n === undefined ? '—' : num(n));

  return (
    <div className="space-y-8">
      {/* Numeri globali del sito, dall'API ufficiale: NON sono la libreria dell'utente, quindi sono
          non-zero anche su un'installazione appena creata (e non dipendono dal sync locale). */}
      <StatsSection
        title="Catalogo AnimeUnion"
        description="L'intero catalogo del sito, dai dati ufficiali di AnimeUnion. È uguale per tutti: non è la tua libreria."
      >
        <StatCard
          icon={<Clapperboard className="h-5 w-5" />}
          label="Anime a catalogo"
          value={catalogValue(site.data?.totalAnime)}
          hint={site.data === null ? 'Dato non disponibile ora' : undefined}
        />
        <StatCard
          icon={<ListVideo className="h-5 w-5" />}
          label="Episodi totali"
          value={catalogValue(site.data?.totalEpisodes)}
          hint={site.data === null ? 'Dato non disponibile ora' : undefined}
        />
      </StatsSection>

      {/* Solo dati dell'utente: su un'app nuova partono tutti da zero. */}
      <StatsSection
        title="La tua libreria"
        description="Solo ciò che hai nell'app: anime seguiti, episodi scaricati e spazio occupato."
      >
        <StatCard
          icon={<Heart className="h-5 w-5" />}
          label="Anime seguiti"
          value={num(data.followedAnime)}
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Episodi scaricati"
          value={num(data.downloadedEpisodes)}
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
      </StatsSection>
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
