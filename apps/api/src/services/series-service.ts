import type { SeriesOverrideInput, SeriesResolved } from '@animeunion/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import { NotFoundError } from '../lib/errors';
import type { SeriesResolver } from './series-resolver';

export interface SeriesService {
  /** Stagione/serie correnti per un anime (dopo override/euristica). */
  getResolved(animeId: string): SeriesResolved;
  /** Imposta o aggiorna l'override manuale. Campi a null azzerano quel campo. */
  setOverride(input: SeriesOverrideInput): SeriesResolved;
  /** Rimuove l'override: si torna a euristica/API. */
  clearOverride(animeId: string): SeriesResolved;
}

export interface SeriesServiceDeps {
  db: Db;
  resolver: SeriesResolver;
  now?: () => Date;
}

export function createSeriesService(deps: SeriesServiceDeps): SeriesService {
  const { db, resolver } = deps;
  const now = deps.now ?? (() => new Date());

  // L'utente ha gia' scaricato/accodato da questa serie? Allora la stagione e' di
  // fatto gia' decisa: non serve richiedere la conferma.
  function hasExistingDownload(animeId: string): boolean {
    const downloaded = db
      .select({ id: schema.episodeFile.id })
      .from(schema.episodeFile)
      .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
      .where(
        and(
          eq(schema.episode.animeId, animeId),
          eq(schema.episodeFile.downloadStatus, 'downloaded'),
        ),
      )
      .get();
    if (downloaded) {
      return true;
    }
    const queued = db
      .select({ id: schema.downloadQueue.id })
      .from(schema.downloadQueue)
      .innerJoin(schema.episodeFile, eq(schema.episodeFile.id, schema.downloadQueue.episodeFileId))
      .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
      .where(eq(schema.episode.animeId, animeId))
      .get();
    return !!queued;
  }

  function resolved(animeId: string): SeriesResolved {
    const info = resolver.resolve(animeId);
    const root = db
      .select({ title: schema.anime.title, titleIta: schema.anime.titleIta })
      .from(schema.anime)
      .where(eq(schema.anime.id, info.seriesId))
      .get();
    const override = db
      .select({ animeId: schema.seriesOverride.animeId })
      .from(schema.seriesOverride)
      .where(eq(schema.seriesOverride.animeId, animeId))
      .get();
    const hasOverride = !!override;
    return {
      animeId,
      seasonNumber: info.seasonNumber,
      seriesAnimeId: info.seriesId,
      seriesSlug: info.seriesSlug,
      seriesTitle: root?.titleIta ?? root?.title ?? info.seriesSlug,
      hasOverride,
      confirmed: hasOverride || hasExistingDownload(animeId),
    };
  }

  return {
    getResolved(animeId) {
      const exists = db
        .select({ id: schema.anime.id })
        .from(schema.anime)
        .where(eq(schema.anime.id, animeId))
        .get();
      if (!exists) {
        throw new NotFoundError(`Anime non trovato: ${animeId}`);
      }
      return resolved(animeId);
    },

    setOverride({ animeId, seasonNumber, seriesAnimeId }) {
      const exists = db
        .select({ id: schema.anime.id })
        .from(schema.anime)
        .where(eq(schema.anime.id, animeId))
        .get();
      if (!exists) {
        throw new NotFoundError(`Anime non trovato: ${animeId}`);
      }
      if (seriesAnimeId) {
        const root = db
          .select({ id: schema.anime.id })
          .from(schema.anime)
          .where(eq(schema.anime.id, seriesAnimeId))
          .get();
        if (!root) {
          throw new NotFoundError(`Serie madre non trovata: ${seriesAnimeId}`);
        }
      }
      // Override vuoto = nessun vincolo: equivale a rimuoverlo.
      if (seasonNumber == null && seriesAnimeId == null) {
        return this.clearOverride(animeId);
      }
      const timestamp = now().toISOString();
      db.insert(schema.seriesOverride)
        .values({
          animeId,
          seriesAnimeId: seriesAnimeId ?? null,
          seasonNumber: seasonNumber ?? null,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: schema.seriesOverride.animeId,
          set: {
            seriesAnimeId: seriesAnimeId ?? null,
            seasonNumber: seasonNumber ?? null,
            updatedAt: timestamp,
          },
        })
        .run();
      return resolved(animeId);
    },

    clearOverride(animeId) {
      db.delete(schema.seriesOverride).where(eq(schema.seriesOverride.animeId, animeId)).run();
      return resolved(animeId);
    },
  };
}
