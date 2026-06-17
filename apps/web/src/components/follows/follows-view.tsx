'use client';

import { AnimeGridSkeleton } from '@/components/anime/anime-grid';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FOLLOW_STATUSES } from '@/lib/follow';
import { trpc } from '@/lib/trpc';
import { FollowCard } from './follow-card';

const GRID_CLASS = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6';

export function FollowsView() {
  const { data, isLoading } = trpc.follow.list.useQuery();
  const follows = data ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Seguiti</h1>
        <p className="text-sm text-muted-foreground">
          Gli anime che segui sono sincronizzati con i Preferiti del sito. Lo stato (in corso,
          completato, ecc.) è locale e decide chi viene scaricato automaticamente.
        </p>
      </div>

      {isLoading ? (
        <AnimeGridSkeleton />
      ) : (
        <Tabs defaultValue="watching">
          <TabsList className="flex-wrap">
            {FOLLOW_STATUSES.map((status) => {
              const count = follows.filter((follow) => follow.status === status.value).length;
              return (
                <TabsTrigger key={status.value} value={status.value} title={status.hint}>
                  {status.label} ({count})
                </TabsTrigger>
              );
            })}
          </TabsList>

          {FOLLOW_STATUSES.map((status) => {
            const items = follows.filter((follow) => follow.status === status.value);
            return (
              <TabsContent key={status.value} value={status.value} className="mt-4">
                <p className="mb-4 text-sm text-muted-foreground">{status.hint}</p>
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
