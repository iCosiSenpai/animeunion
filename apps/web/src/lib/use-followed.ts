import { trpc } from '@/lib/trpc';

/**
 * Set degli animeId attualmente seguiti. react-query deduplica la query `follow.list`,
 * quindi tutte le card che usano questo hook condividono un'unica richiesta/cache.
 */
export function useFollowedIds(): Set<string> {
  const follows = trpc.follow.list.useQuery();
  return new Set((follows.data ?? []).map((follow) => follow.animeId));
}
