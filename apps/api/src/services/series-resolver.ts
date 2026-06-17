import { and, count, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';

export interface SeriesInfo {
  seriesId: string;
  seasonNumber: number;
  seriesSlug: string;
}

export interface SeriesResolverDeps {
  db: Db;
}

const CHAIN_RELATIONS = ['PREQUEL', 'SEQUEL', 'SPIN_OFF'];

export interface SeriesResolver {
  resolve(animeId: string): SeriesInfo;
}

export function createSeriesResolver(deps: SeriesResolverDeps): SeriesResolver {
  const { db } = deps;

  function fallback(anime: typeof schema.anime.$inferSelect): SeriesInfo {
    return { seriesId: anime.id, seasonNumber: 1, seriesSlug: anime.slug };
  }

  function fromApiData(anime: typeof schema.anime.$inferSelect): SeriesInfo | null {
    if (!anime.seriesId || anime.seasonNumber == null) {
      return null;
    }
    const root = db
      .select({ slug: schema.anime.slug })
      .from(schema.anime)
      .where(and(eq(schema.anime.seriesId, anime.seriesId), eq(schema.anime.seasonNumber, 1)))
      .get();
    return {
      seriesId: anime.seriesId,
      seasonNumber: anime.seasonNumber,
      seriesSlug: root?.slug ?? anime.slug,
    };
  }

  function discoverChain(startId: string): Set<string> {
    const visited = new Set<string>();
    const queue: string[] = [startId];
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id || visited.has(id)) {
        continue;
      }
      visited.add(id);
      const rows = db
        .select({ relatedId: schema.animeRelation.relatedAnimeId })
        .from(schema.animeRelation)
        .where(
          and(
            eq(schema.animeRelation.animeId, id),
            inArray(schema.animeRelation.relationType, CHAIN_RELATIONS),
          ),
        )
        .all();
      for (const row of rows) {
        if (!visited.has(row.relatedId)) {
          queue.push(row.relatedId);
        }
      }
      const reverse = db
        .select({ animeId: schema.animeRelation.animeId })
        .from(schema.animeRelation)
        .where(
          and(
            eq(schema.animeRelation.relatedAnimeId, id),
            inArray(schema.animeRelation.relationType, CHAIN_RELATIONS),
          ),
        )
        .all();
      for (const row of reverse) {
        if (!visited.has(row.animeId)) {
          queue.push(row.animeId);
        }
      }
    }
    return visited;
  }

  function findRoot(nodes: Set<string>): string | null {
    let rootId: string | null = null;
    for (const id of nodes) {
      const row = db
        .select({ n: count() })
        .from(schema.animeRelation)
        .where(
          and(
            eq(schema.animeRelation.animeId, id),
            eq(schema.animeRelation.relationType, 'PREQUEL'),
          ),
        )
        .get();
      if (!row?.n) {
        if (rootId) {
          return null;
        }
        rootId = id;
      }
    }
    return rootId;
  }

  function computeDistances(rootId: string): Map<string, number> {
    const distances = new Map<string, number>();
    const queue: Array<{ id: string; dist: number }> = [{ id: rootId, dist: 1 }];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) {
        continue;
      }
      const { id, dist } = next;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      distances.set(id, dist);
      const rows = db
        .select({ relatedId: schema.animeRelation.relatedAnimeId })
        .from(schema.animeRelation)
        .where(
          and(
            eq(schema.animeRelation.animeId, id),
            inArray(schema.animeRelation.relationType, ['SEQUEL', 'SPIN_OFF']),
          ),
        )
        .all();
      for (const row of rows) {
        if (!seen.has(row.relatedId)) {
          queue.push({ id: row.relatedId, dist: dist + 1 });
        }
      }
    }
    return distances;
  }

  function fromRelations(anime: typeof schema.anime.$inferSelect): SeriesInfo | null {
    const nodes = discoverChain(anime.id);
    const rootId = findRoot(nodes);
    if (!rootId) {
      return null;
    }
    const distances = computeDistances(rootId);
    const seasonNumber = distances.get(anime.id);
    if (!seasonNumber) {
      return null;
    }
    const root = db.select().from(schema.anime).where(eq(schema.anime.id, rootId)).get();
    return {
      seriesId: rootId,
      seasonNumber,
      seriesSlug: root?.slug ?? anime.slug,
    };
  }

  return {
    resolve(animeId) {
      const anime = db.select().from(schema.anime).where(eq(schema.anime.id, animeId)).get();
      if (!anime) {
        return { seriesId: animeId, seasonNumber: 1, seriesSlug: animeId };
      }
      return fromApiData(anime) ?? fromRelations(anime) ?? fallback(anime);
    },
  };
}
