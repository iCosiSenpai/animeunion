import {
  type AnimeSource,
  type Follow,
  type FollowAddInput,
  type FollowSetAutoDownloadInput,
  type FollowUpdateStatusInput,
  type FollowWithAnime,
  followStatusSchema,
} from '@animeunion/shared';
import { and, eq, inArray, isNotNull, lte, max, or } from 'drizzle-orm';
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
  setAutoDownload(input: FollowSetAutoDownloadInput): Follow;
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
    autoDownload: row.autoDownload == null ? null : row.autoDownload === 1,
    addedAt: row.addedAt,
    updatedAt: row.updatedAt,
    lastCheckAt: row.lastCheckAt,
  };
}

function toInt(value: boolean | undefined): number | null {
  return value === undefined ? null : value ? 1 : 0;
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

  // Massimo numero episodio del "backlog gia' disponibile" per l'anime: e' la soglia forward-only da
  // cui far partire l'auto-download. Un episodio conta come backlog SOLO se e' gia' scaricato/external
  // OPPURE ha una airDate passata. Un episodio listato in anticipo (airDate NULLA e non ancora
  // scaricato — come AnimeUnion pubblica i prossimi episodi) NON alza la soglia e viene quindi
  // scaricato quando esce. Senza questo, attivare l'auto-download mentre l'ep1 e' gia' annunciato
  // fissava la soglia a 1 e l'ep1 restava escluso per sempre (caso Grand Blue S3, airDate nulla).
  // airDate e now sono stringhe ISO: il confronto lessicografico e' corretto.
  function maxReleasedEpisode(animeId: string): number {
    const nowIso = new Date().toISOString();
    const row = db
      .select({ value: max(schema.episode.number) })
      .from(schema.episode)
      .leftJoin(schema.episodeFile, eq(schema.episodeFile.episodeId, schema.episode.id))
      .where(
        and(
          eq(schema.episode.animeId, animeId),
          or(
            inArray(schema.episodeFile.downloadStatus, ['downloaded', 'external']),
            and(isNotNull(schema.episode.airDate), lte(schema.episode.airDate, nowIso)),
          ),
        ),
      )
      .get();
    return row?.value ?? 0;
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
      const autoDownload = toInt(input.autoDownload);
      const existing = findByAnimeId(input.animeId);
      if (existing) {
        const nextAuto = input.autoDownload === undefined ? existing.autoDownload : autoDownload;
        db.update(schema.follow)
          .set({ status: input.status, autoDownload: nextAuto, updatedAt: timestamp })
          .where(eq(schema.follow.id, existing.id))
          .run();
        return toFollow({
          ...existing,
          status: input.status,
          autoDownload: nextAuto,
          updatedAt: timestamp,
        });
      }
      const row: FollowRow = {
        id: crypto.randomUUID(),
        animeId: input.animeId,
        status: input.status,
        notes: null,
        autoDownload,
        // Forward-only: cattura il backlog gia' uscito al momento del follow, cosi' l'auto-download
        // accodera' solo gli episodi futuri (anche se piu' tardi si passa a "In corso").
        autoDownloadFromEp: maxReleasedEpisode(input.animeId),
        addedAt: timestamp,
        updatedAt: timestamp,
        lastCheckAt: null,
        knownRelationIds: null,
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
      // Passando a "In corso" l'auto-download diventa effettivo (autoDownload null ricade su
      // status==='watching'). Se la soglia forward-only non e' mai stata fissata (import preferiti
      // o righe legacy pre-migrazione), la ancoriamo ora al max episodio: evita che il primo tick
      // auto-scarichi l'intero backlog gia' uscito.
      const fromEp =
        input.status === 'watching' && existing.autoDownloadFromEp == null
          ? maxReleasedEpisode(existing.animeId)
          : existing.autoDownloadFromEp;
      db.update(schema.follow)
        .set({ status: input.status, autoDownloadFromEp: fromEp, updatedAt: timestamp })
        .where(eq(schema.follow.id, existing.id))
        .run();
      return toFollow({
        ...existing,
        status: input.status,
        autoDownloadFromEp: fromEp,
        updatedAt: timestamp,
      });
    },

    setAutoDownload(input: FollowSetAutoDownloadInput): Follow {
      const existing = findByAnimeId(input.animeId);
      if (!existing) {
        throw new NotFoundError(`Follow non trovato per anime: ${input.animeId}`);
      }
      const timestamp = new Date().toISOString();
      const autoDownload = input.autoDownload ? 1 : 0;
      // Accendendo l'auto-download la soglia forward-only si allinea al max episodio attuale: da qui
      // in poi solo i nuovi. Spegnendolo resta com'e' (irrilevante: non si auto-accoda).
      const fromEp = input.autoDownload
        ? maxReleasedEpisode(existing.animeId)
        : existing.autoDownloadFromEp;
      db.update(schema.follow)
        .set({ autoDownload, autoDownloadFromEp: fromEp, updatedAt: timestamp })
        .where(eq(schema.follow.id, existing.id))
        .run();
      return toFollow({
        ...existing,
        autoDownload,
        autoDownloadFromEp: fromEp,
        updatedAt: timestamp,
      });
    },
  };
}
