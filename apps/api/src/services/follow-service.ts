import {
  type AnimeSource,
  type Follow,
  type FollowAddInput,
  type FollowUpdateStatusInput,
  type FollowWithAnime,
  followStatusSchema,
} from '@animeunion/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import { NotFoundError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import { loadGenresByAnimeIds, toAnimeSummary } from './mappers';

type FollowRow = typeof schema.follow.$inferSelect;

export interface FollowService {
  list(): FollowWithAnime[];
  add(input: FollowAddInput): Follow;
  remove(animeId: string): void;
  updateStatus(input: FollowUpdateStatusInput): Follow;
}

export interface FollowServiceDeps {
  db: Db;
  /** Source del sito: i Preferiti sono la fonte di verita, quindi add/remove vengono propagati. */
  source?: AnimeSource;
  logger?: Logger;
}

function toFollow(row: FollowRow): Follow {
  return {
    id: row.id,
    animeId: row.animeId,
    status: followStatusSchema.parse(row.status),
    notes: row.notes,
    addedAt: row.addedAt,
    updatedAt: row.updatedAt,
    lastCheckAt: row.lastCheckAt,
  };
}

export function createFollowService(deps: FollowServiceDeps): FollowService {
  const { db, source, logger } = deps;

  /** Propaga al sito in modo best-effort: i 404 (endpoint non ancora deployato) sono tollerati. */
  function pushToSite(action: () => Promise<unknown> | undefined): void {
    const result = action();
    if (result) {
      result.catch((error) => {
        logger?.debug({ err: error }, 'Sync preferiti verso il sito fallita (best-effort)');
      });
    }
  }

  function findByAnimeId(animeId: string): FollowRow | undefined {
    return db.select().from(schema.follow).where(eq(schema.follow.animeId, animeId)).get();
  }

  function animeExists(animeId: string): boolean {
    return (
      db
        .select({ id: schema.anime.id })
        .from(schema.anime)
        .where(eq(schema.anime.id, animeId))
        .get() !== undefined
    );
  }

  return {
    list(): FollowWithAnime[] {
      const rows = db
        .select({ follow: schema.follow, anime: schema.anime })
        .from(schema.follow)
        .innerJoin(schema.anime, eq(schema.follow.animeId, schema.anime.id))
        .all();
      const genresMap = loadGenresByAnimeIds(
        db,
        rows.map((row) => row.anime.id),
      );
      return rows.map((row) => ({
        ...toFollow(row.follow),
        anime: toAnimeSummary(row.anime, genresMap.get(row.anime.id) ?? []),
      }));
    },

    add(input: FollowAddInput): Follow {
      if (!animeExists(input.animeId)) {
        throw new NotFoundError(`Anime non trovato: ${input.animeId}`);
      }
      const timestamp = new Date().toISOString();
      const existing = findByAnimeId(input.animeId);
      if (existing) {
        db.update(schema.follow)
          .set({ status: input.status, updatedAt: timestamp })
          .where(eq(schema.follow.id, existing.id))
          .run();
        return toFollow({ ...existing, status: input.status, updatedAt: timestamp });
      }
      const row: FollowRow = {
        id: crypto.randomUUID(),
        animeId: input.animeId,
        status: input.status,
        notes: null,
        addedAt: timestamp,
        updatedAt: timestamp,
        lastCheckAt: null,
      };
      db.insert(schema.follow).values(row).run();
      // Preferiti = fonte di verita: propaga al sito (best-effort).
      pushToSite(() => source?.addFavorite?.(input.animeId));
      return toFollow(row);
    },

    remove(animeId: string): void {
      const result = db.delete(schema.follow).where(eq(schema.follow.animeId, animeId)).run();
      if (result.changes === 0) {
        throw new NotFoundError(`Follow non trovato per anime: ${animeId}`);
      }
      pushToSite(() => source?.removeFavorite?.(animeId));
    },

    updateStatus(input: FollowUpdateStatusInput): Follow {
      const existing = findByAnimeId(input.animeId);
      if (!existing) {
        throw new NotFoundError(`Follow non trovato per anime: ${input.animeId}`);
      }
      const timestamp = new Date().toISOString();
      db.update(schema.follow)
        .set({ status: input.status, updatedAt: timestamp })
        .where(eq(schema.follow.id, existing.id))
        .run();
      return toFollow({ ...existing, status: input.status, updatedAt: timestamp });
    },
  };
}
