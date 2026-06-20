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

const ROMAN_SEASONS: Record<string, number> = { ii: 2, iii: 3, iv: 4, v: 5 };

/**
 * Estrae (slug base, numero stagione) dallo slug di un sequel quando l'API non
 * fornisce seriesId/relazioni. Solo pattern ad alta precisione: il chiamante deve
 * comunque verificare che lo slug base esista a catalogo (guardia anti-falsi-positivi).
 */
export function parseSeasonFromSlug(slug: string): { base: string; season: number } | null {
  const s = slug.toLowerCase();
  const ordinal = s.match(/^(.+)-(\d+)(?:st|nd|rd|th)-season$/);
  if (ordinal?.[1] && ordinal[2]) {
    return { base: ordinal[1], season: Number(ordinal[2]) };
  }
  const seasonN = s.match(/^(.+)-season-(\d+)$/);
  if (seasonN?.[1] && seasonN[2]) {
    return { base: seasonN[1], season: Number(seasonN[2]) };
  }
  const roman = s.match(/^(.+)-(ii|iii|iv|v)$/);
  if (roman?.[1] && roman[2]) {
    return { base: roman[1], season: ROMAN_SEASONS[roman[2]] ?? 1 };
  }
  // Numero finale singolo (es. boku-no-hero-academia-2): solo 2..9 per evitare
  // titoli che contengono numeri (22-7, attack-no-1, burn-the-witch-0-8).
  const trailing = s.match(/^(.+)-(\d)$/);
  if (trailing?.[1] && trailing[2]) {
    const n = Number(trailing[2]);
    if (n >= 2 && n <= 9) {
      return { base: trailing[1], season: n };
    }
  }
  return null;
}

export interface SeriesResolver {
  resolve(animeId: string): SeriesInfo;
}

export function createSeriesResolver(deps: SeriesResolverDeps): SeriesResolver {
  const { db } = deps;

  function fallback(anime: typeof schema.anime.$inferSelect): SeriesInfo {
    return { seriesId: anime.id, seasonNumber: 1, seriesSlug: anime.slug };
  }

  function fromOverride(anime: typeof schema.anime.$inferSelect): SeriesInfo | null {
    const row = db
      .select()
      .from(schema.seriesOverride)
      .where(eq(schema.seriesOverride.animeId, anime.id))
      .get();
    if (!row || (row.seriesAnimeId == null && row.seasonNumber == null)) {
      return null;
    }
    const root = row.seriesAnimeId
      ? db
          .select({ id: schema.anime.id, slug: schema.anime.slug })
          .from(schema.anime)
          .where(eq(schema.anime.id, row.seriesAnimeId))
          .get()
      : null;
    return {
      seriesId: root?.id ?? anime.id,
      seasonNumber: row.seasonNumber ?? 1,
      seriesSlug: root?.slug ?? anime.slug,
    };
  }

  function fromSlugHeuristic(anime: typeof schema.anime.$inferSelect): SeriesInfo | null {
    const parsed = parseSeasonFromSlug(anime.slug);
    if (!parsed) {
      return null;
    }
    // La serie base deve esistere come ALTRA entry: senza questa guardia titoli con
    // numeri nello slug (22-7) verrebbero scambiati per stagioni.
    for (const candidate of [parsed.base, `${parsed.base}-1`]) {
      const root = db
        .select({ id: schema.anime.id, slug: schema.anime.slug })
        .from(schema.anime)
        .where(eq(schema.anime.slug, candidate))
        .get();
      if (root && root.id !== anime.id) {
        return { seriesId: root.id, seasonNumber: parsed.season, seriesSlug: root.slug };
      }
    }
    return null;
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
    // Nessuna relazione reale: l'anime è isolato. Lascia decidere euristica/fallback
    // (altrimenti verrebbe sempre trattato come root di una serie a sé, Season 01).
    if (nodes.size <= 1) {
      return null;
    }
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
      return (
        fromOverride(anime) ??
        fromApiData(anime) ??
        fromRelations(anime) ??
        fromSlugHeuristic(anime) ??
        fallback(anime)
      );
    },
  };
}
