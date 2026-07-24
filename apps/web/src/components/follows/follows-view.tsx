'use client';

import { AnimeGridSkeleton } from '@/components/anime/anime-grid';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isFollowPaused } from '@/lib/follow';
import { trpc } from '@/lib/trpc';
import type { FollowWithAnime } from '@animeunion/shared';
import { AlertCircle, Settings2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { FollowCard } from './follow-card';

const GRID_CLASS = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6';

// Filtri orientati al COMPORTAMENTO (non più i 5 tag di stato watchlist): cosa scarica in
// automatico e cosa è in pausa. "In pausa" copre anche i record legacy "dropped".
const FILTERS = [
  { value: 'all', label: 'Tutti' },
  { value: 'auto', label: 'Con auto-download' },
  { value: 'paused', label: 'In pausa' },
] as const;
type FilterValue = (typeof FILTERS)[number]['value'];

function matchesFilter(follow: FollowWithAnime, filter: FilterValue): boolean {
  if (filter === 'all') return true;
  const paused = isFollowPaused(follow.status);
  if (filter === 'paused') return paused;
  // "Con auto-download": auto attivo (esplicito o default su watching) e non in pausa.
  return !paused && (follow.autoDownload ?? follow.status === 'watching');
}

export function FollowsView() {
  const { data, isLoading, isError, refetch } = trpc.follow.list.useQuery();
  const config = trpc.config.getAll.useQuery();
  const follows = data ?? [];

  // Footgun: le card mostrano il badge "Auto" e la checkbox e' spuntata di default, ma se il master
  // globale e' spento non parte nulla. Avvisiamo solo se c'e' davvero almeno un follow "auto".
  const masterOff = config.data ? !config.data.autoDownload : false;
  const hasAutoFollows = follows.some(
    (follow) =>
      !isFollowPaused(follow.status) && (follow.autoDownload ?? follow.status === 'watching'),
  );
  const showAutoWarning = masterOff && hasAutoFollows;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="La tua lista"
        title="Seguiti"
        description="Gli anime che segui, sincronizzati con i Preferiti del sito. Attiva l'auto-download o metti in pausa dal dettaglio della serie o dal menu della card."
      />

      {showAutoWarning ? (
        <output className="flex w-full flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <TriangleAlert
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
            <div className="space-y-0.5">
              <p className="font-medium text-foreground">Auto-download globale disattivato</p>
              <p className="text-muted-foreground">
                Alcune serie sono impostate su «Auto», ma l&apos;interruttore globale è spento: i
                nuovi episodi non verranno scaricati finché non lo attivi.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="shrink-0 border-amber-500/50">
            <Link href="/settings">
              <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Attiva nelle Impostazioni
            </Link>
          </Button>
        </output>
      ) : null}

      {isLoading ? (
        <AnimeGridSkeleton />
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Impossibile caricare i seguiti"
          description="Controlla la connessione e riprova."
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Riprova
            </Button>
          }
        />
      ) : (
        <Tabs defaultValue="all">
          {/* Filtri comportamentali (non più i 5 tag). Su schermi stretti la barra scorre in
              orizzontale invece di andare a capo fuori dal riquadro. */}
          <TabsList className="w-full max-w-full justify-start overflow-x-auto">
            {FILTERS.map((f) => {
              const count = follows.filter((follow) => matchesFilter(follow, f.value)).length;
              return (
                <TabsTrigger key={f.value} value={f.value} className="shrink-0">
                  {f.label} ({count})
                </TabsTrigger>
              );
            })}
          </TabsList>

          {FILTERS.map((f) => {
            const items = follows.filter((follow) => matchesFilter(follow, f.value));
            return (
              <TabsContent key={f.value} value={f.value} className="mt-4">
                {items.length === 0 ? (
                  <p className="py-16 text-center text-muted-foreground">
                    Nessun anime in questa categoria.
                  </p>
                ) : (
                  <div className={GRID_CLASS}>
                    {items.map((follow) => (
                      <FollowCard key={follow.id} follow={follow} />
                    ))}
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}
