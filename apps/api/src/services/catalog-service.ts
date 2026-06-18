import type {
  AnimeDetail,
  AnimeSource,
  AnimeSummary,
  CalendarEntry,
  CalendarWeek,
  CatalogBrowseInput,
  CatalogFilters,
  EpisodeDetail,
  EpisodeSummary,
  GenreDetail,
  PaginatedAnime,
  RelatedAnime,
  Season,
  WeekDay,
} from '@animeunion/shared';
import { type SQL, and, asc, count, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import { NotFoundError } from '../lib/errors';
import { ApiError } from '../lib/http-client';
import type { Logger } from '../lib/logger';
import type { ConfigService } from './config-service';
import { type AnimeRow, loadGenresByAnimeIds, toAnimeSummary, toEpisodeSummary } from './mappers';

const PER_PAGE = 24;
const SYNC_TIMESTAMP_KEY = 'catalog_synced_at';
const CALENDAR_TTL_MS = 30 * 60 * 1000;

type SourceEpisode = EpisodeSummary & { downloadUrl?: string; expiresAt?: string | null };

export interface CatalogServiceOptions {
  db: Db;
  source: AnimeSource;
  config: ConfigService;
  logger: Logger;
  now?: () => Date;
}

export interface SyncStatus {
  running: boolean;
  lastSyncedAt: string | null;
}

export interface CatalogService {
  search(input: { query: string; page: number }): Promise<PaginatedAnime>;
  getBySlug(slug: string): Promise<AnimeDetail>;
  byGenre(genreSlug: string, page: number): Promise<PaginatedAnime>;
  bySeason(season: Season, year: number, page: number): Promise<PaginatedAnime>;
  byYear(year: number, page: number): Promise<PaginatedAnime>;
  recent(page: number): Promise<PaginatedAnime>;
  topRated(page: number): Promise<PaginatedAnime>;
  browse(input: CatalogBrowseInput): Promise<PaginatedAnime>;
  filters(): Promise<CatalogFilters>;
  syncCatalog(): Promise<{ synced: number }>;
  syncStatus(): SyncStatus;
  listEpisodes(animeSlug: string): Promise<EpisodeSummary[]>;
  getEpisodeFile(episodeFileId: string): Promise<EpisodeDetail>;
  getCalendar(): Promise<CalendarWeek>;
  getCalendarDay(day: WeekDay): Promise<CalendarEntry>;
}

export function createCatalogService(options: CatalogServiceOptions): CatalogService {
  const { db, source, config, logger } = options;
  const now = options.now ?? (() => new Date());
  let syncRunning = false;
  let calendarCache: { fetchedAt: number; week: CalendarWeek } | null = null;

  function getLastSyncedAt(): string | null {
    const row = db
      .select()
      .from(schema.stats)
      .where(eq(schema.stats.key, SYNC_TIMESTAMP_KEY))
      .get();
    if (!row) {
      return null;
    }
    try {
      const value = JSON.parse(row.value);
      return typeof value === 'string' ? value : null;
    } catch {
      return null;
    }
  }

  function setLastSyncedAt(iso: string): void {
    const timestamp = now().toISOString();
    db.insert(schema.stats)
      .values({ key: SYNC_TIMESTAMP_KEY, value: JSON.stringify(iso), updatedAt: timestamp })
      .onConflictDoUpdate({
        target: schema.stats.key,
        set: { value: JSON.stringify(iso), updatedAt: timestamp },
      })
      .run();
  }

  function ttlMs(): number {
    return config.get('catalogSyncHours') * 60 * 60 * 1000;
  }

  function isCacheFresh(): boolean {
    const lastSyncedAt = getLastSyncedAt();
    if (!lastSyncedAt) {
      return false;
    }
    return new Date(lastSyncedAt).getTime() + ttlMs() > now().getTime();
  }

  function isRowFresh(row: AnimeRow): boolean {
    return new Date(row.updatedAt).getTime() + ttlMs() > now().getTime();
  }

  function hasEpisodes(animeId: string): boolean {
    const row = db
      .select({ n: count() })
      .from(schema.episode)
      .where(eq(schema.episode.animeId, animeId))
      .get();
    return (row?.n ?? 0) > 0;
  }

  function hasAnyAnime(): boolean {
    const row = db.select({ n: count() }).from(schema.anime).get();
    return (row?.n ?? 0) > 0;
  }

  function upsertSummary(summary: AnimeSummary): void {
    const timestamp = now().toISOString();
    db.insert(schema.anime)
      .values({
        id: summary.id,
        slug: summary.slug,
        title: summary.title,
        titleIta: summary.titleIta,
        type: summary.type,
        status: summary.status,
        season: summary.season,
        seasonYear: summary.seasonYear,
        episodeCount: 0,
        coverImage: summary.coverImage,
        score: summary.score,
        languages: JSON.stringify(summary.availableLanguages),
        seriesId: summary.seriesId,
        seasonNumber: summary.seasonNumber,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: schema.anime.id,
        set: {
          slug: summary.slug,
          title: summary.title,
          titleIta: summary.titleIta,
          type: summary.type,
          status: summary.status,
          season: summary.season,
          seasonYear: summary.seasonYear,
          coverImage: summary.coverImage,
          score: summary.score,
          languages: JSON.stringify(summary.availableLanguages),
          seriesId: summary.seriesId,
          seasonNumber: summary.seasonNumber,
          updatedAt: timestamp,
        },
      })
      .run();
    upsertGenres(summary.id, summary.genres);
  }

  function upsertGenres(
    animeId: string,
    genres: Array<{
      id: string;
      slug: string;
      name: string;
      nameEng?: string | null;
      malId?: number | null;
    }>,
  ): void {
    for (const genre of genres) {
      db.insert(schema.genre)
        .values({
          id: genre.id,
          slug: genre.slug,
          name: genre.name,
          nameEng: genre.nameEng ?? null,
          malId: genre.malId ?? null,
        })
        .onConflictDoNothing()
        .run();
    }
    db.delete(schema.animeGenre).where(eq(schema.animeGenre.animeId, animeId)).run();
    for (const genre of genres) {
      db.insert(schema.animeGenre)
        .values({ animeId, genreId: genre.id })
        .onConflictDoNothing()
        .run();
    }
  }

  function saveDetail(detail: AnimeDetail): void {
    const timestamp = now().toISOString();
    db.insert(schema.anime)
      .values({
        id: detail.id,
        slug: detail.slug,
        title: detail.title,
        titleIta: detail.titleIta,
        titleEng: detail.titleEng,
        titleJpn: detail.titleJpn,
        synopsis: detail.synopsis,
        synopsisEng: detail.synopsisEng,
        type: detail.type,
        status: detail.status,
        season: detail.season,
        seasonYear: detail.seasonYear,
        episodeCount: detail.episodeCount,
        episodeDuration: detail.episodeDuration,
        coverImage: detail.coverImage,
        bannerImage: detail.bannerImage,
        trailerUrl: detail.trailerUrl,
        studio: detail.studio,
        score: detail.score,
        malId: detail.malId,
        anilistId: detail.anilistId,
        languages: JSON.stringify(detail.availableLanguages),
        seriesId: detail.seriesId,
        seasonNumber: detail.seasonNumber,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: schema.anime.id,
        set: {
          slug: detail.slug,
          title: detail.title,
          titleIta: detail.titleIta,
          titleEng: detail.titleEng,
          titleJpn: detail.titleJpn,
          synopsis: detail.synopsis,
          synopsisEng: detail.synopsisEng,
          type: detail.type,
          status: detail.status,
          season: detail.season,
          seasonYear: detail.seasonYear,
          episodeCount: detail.episodeCount,
          episodeDuration: detail.episodeDuration,
          coverImage: detail.coverImage,
          bannerImage: detail.bannerImage,
          trailerUrl: detail.trailerUrl,
          studio: detail.studio,
          score: detail.score,
          malId: detail.malId,
          anilistId: detail.anilistId,
          languages: JSON.stringify(detail.availableLanguages),
          seriesId: detail.seriesId,
          seasonNumber: detail.seasonNumber,
          updatedAt: timestamp,
        },
      })
      .run();
    upsertGenres(detail.id, detail.genres);
    saveRelations(detail.id, detail.relatedAnime);
    saveEpisodes(detail.id, detail.episodes);
  }

  function saveRelations(animeId: string, relations: RelatedAnime[]): void {
    db.delete(schema.animeRelation).where(eq(schema.animeRelation.animeId, animeId)).run();
    for (const relation of relations) {
      // La FK su related_anime_id richiede che l'anime correlato sia presente: se non e'
      // ancora in catalogo saltiamo la relazione per non far fallire tutto il salvataggio.
      const exists = db
        .select({ id: schema.anime.id })
        .from(schema.anime)
        .where(eq(schema.anime.id, relation.id))
        .get();
      if (!exists) {
        continue;
      }
      db.insert(schema.animeRelation)
        .values({
          animeId,
          relatedAnimeId: relation.id,
          relationType: relation.relationType,
        })
        .onConflictDoNothing()
        .run();
    }
  }

  function loadRelationsFromDb(animeId: string): RelatedAnime[] {
    const rows = db
      .select({ relationType: schema.animeRelation.relationType, related: schema.anime })
      .from(schema.animeRelation)
      .innerJoin(schema.anime, eq(schema.anime.id, schema.animeRelation.relatedAnimeId))
      .where(eq(schema.animeRelation.animeId, animeId))
      .all();
    return rows.map(({ relationType, related }) => ({
      id: related.id,
      slug: related.slug,
      title: related.title,
      titleIta: related.titleIta,
      coverImage: related.coverImage,
      type: related.type as RelatedAnime['type'],
      seasonYear: related.seasonYear,
      relationType,
      seriesId: related.seriesId,
      seasonNumber: related.seasonNumber,
    }));
  }

  function saveEpisodes(animeId: string, episodes: SourceEpisode[]): void {
    const timestamp = now().toISOString();
    const byNumber = new Map<number, SourceEpisode[]>();
    for (const episode of episodes) {
      const bucket = byNumber.get(episode.number) ?? [];
      bucket.push(episode);
      byNumber.set(episode.number, bucket);
    }
    for (const [number, entries] of byNumber) {
      const first = entries[0];
      if (!first) {
        continue;
      }
      const episodeId = `${animeId}_e${number}`;
      const languages = entries.map((entry) => entry.language);
      db.insert(schema.episode)
        .values({
          id: episodeId,
          animeId,
          number,
          title: first.title,
          titleIta: first.titleIta,
          thumbnail: first.thumbnail,
          duration: first.duration,
          airDate: first.airDate,
          isFiller: first.isFiller ? 1 : 0,
          languages: JSON.stringify(languages),
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: schema.episode.id,
          set: {
            title: first.title,
            titleIta: first.titleIta,
            thumbnail: first.thumbnail,
            duration: first.duration,
            airDate: first.airDate,
            isFiller: first.isFiller ? 1 : 0,
            languages: JSON.stringify(languages),
            updatedAt: timestamp,
          },
        })
        .run();
      for (const entry of entries) {
        db.insert(schema.episodeFile)
          .values({
            id: `${episodeId}_${entry.language}`,
            episodeId,
            language: entry.language,
            downloadUrl: entry.downloadUrl ?? null,
            urlExpiresAt: entry.expiresAt ?? null,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .onConflictDoUpdate({
            target: [schema.episodeFile.episodeId, schema.episodeFile.language],
            set: {
              downloadUrl: entry.downloadUrl ?? null,
              urlExpiresAt: entry.expiresAt ?? null,
              updatedAt: timestamp,
            },
          })
          .run();
      }
    }
  }

  function listEpisodesFromDb(animeId: string): EpisodeSummary[] {
    const rows = db
      .select({ episode: schema.episode, file: schema.episodeFile })
      .from(schema.episode)
      .innerJoin(schema.episodeFile, eq(schema.episodeFile.episodeId, schema.episode.id))
      .where(eq(schema.episode.animeId, animeId))
      .orderBy(asc(schema.episode.number), asc(schema.episodeFile.language))
      .all();
    return rows.map((row) => toEpisodeSummary(row.episode, row.file));
  }

  function assembleDetailFromDb(row: AnimeRow): AnimeDetail {
    const genreRows = db
      .select({ genre: schema.genre })
      .from(schema.animeGenre)
      .innerJoin(schema.genre, eq(schema.animeGenre.genreId, schema.genre.id))
      .where(eq(schema.animeGenre.animeId, row.id))
      .all();
    const genres = genreRows.map(({ genre }) => ({
      id: genre.id,
      slug: genre.slug,
      name: genre.name,
      nameEng: genre.nameEng,
      malId: genre.malId,
    }));
    const summary = toAnimeSummary(row, genres);
    return {
      ...summary,
      titleEng: row.titleEng,
      titleJpn: row.titleJpn,
      synopsis: row.synopsis,
      synopsisEng: row.synopsisEng,
      bannerImage: row.bannerImage,
      trailerUrl: row.trailerUrl,
      studio: row.studio,
      episodeCount: row.episodeCount,
      episodeDuration: row.episodeDuration,
      malId: row.malId,
      anilistId: row.anilistId,
      season: row.season as AnimeDetail['season'],
      genres,
      relatedAnime: loadRelationsFromDb(row.id),
      recommendations: [],
      episodes: listEpisodesFromDb(row.id),
    };
  }

  function getAnimeRowBySlug(slug: string): AnimeRow | undefined {
    return db.select().from(schema.anime).where(eq(schema.anime.slug, slug)).get();
  }

  function paginateRows(rows: AnimeRow[], total: number, page: number): PaginatedAnime {
    const genresMap = loadGenresByAnimeIds(
      db,
      rows.map((row) => row.id),
    );
    return {
      data: rows.map((row) => toAnimeSummary(row, genresMap.get(row.id) ?? [])),
      meta: {
        page,
        perPage: PER_PAGE,
        total,
        hasMore: page * PER_PAGE < total,
      },
    };
  }

  function queryAnime(where: SQL | undefined, page: number, orderBy?: SQL): PaginatedAnime {
    const totalRow = db.select({ n: count() }).from(schema.anime).where(where).get();
    const rows = db
      .select()
      .from(schema.anime)
      .where(where)
      .orderBy(orderBy ?? asc(schema.anime.title))
      .limit(PER_PAGE)
      .offset((page - 1) * PER_PAGE)
      .all();
    return paginateRows(rows, totalRow?.n ?? 0, page);
  }

  function searchDb(query: string, page: number): PaginatedAnime {
    const needle = query.trim();
    const where =
      needle.length > 0
        ? or(like(schema.anime.title, `%${needle}%`), like(schema.anime.titleIta, `%${needle}%`))
        : undefined;
    return queryAnime(where, page);
  }

  function buildBrowseWhere(input: CatalogBrowseInput): SQL | undefined {
    const conditions: SQL[] = [];
    const needle = input.query?.trim();
    if (needle) {
      conditions.push(
        or(
          like(schema.anime.title, `%${needle}%`),
          like(schema.anime.titleIta, `%${needle}%`),
        ) as SQL,
      );
    }
    if (input.genre) {
      const matching = db
        .select({ animeId: schema.animeGenre.animeId })
        .from(schema.animeGenre)
        .innerJoin(schema.genre, eq(schema.animeGenre.genreId, schema.genre.id))
        .where(eq(schema.genre.slug, input.genre));
      conditions.push(inArray(schema.anime.id, matching));
    }
    if (input.type) {
      conditions.push(eq(schema.anime.type, input.type));
    }
    if (input.status) {
      conditions.push(eq(schema.anime.status, input.status));
    }
    if (input.year) {
      conditions.push(eq(schema.anime.seasonYear, input.year));
    }
    if (input.season) {
      conditions.push(eq(schema.anime.season, input.season));
    }
    if (input.language) {
      conditions.push(like(schema.anime.languages, `%${input.language}%`));
    }
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  function orderByForSort(sort: CatalogBrowseInput['sort']): SQL {
    const effective = sort ?? 'recent';
    if (effective === 'score') {
      return sql`${schema.anime.score} IS NULL, ${schema.anime.score} DESC`;
    }
    if (effective === 'title') {
      return asc(schema.anime.title);
    }
    return desc(schema.anime.createdAt);
  }

  return {
    async search(input): Promise<PaginatedAnime> {
      if (isCacheFresh()) {
        return searchDb(input.query, input.page);
      }
      try {
        const result = await source.searchAnime(input.query, input.page);
        for (const summary of result.data) {
          upsertSummary(summary);
        }
        return result;
      } catch (error) {
        if (hasAnyAnime()) {
          logger.warn({ err: error }, 'Source non raggiungibile, fallback al DB locale');
          return searchDb(input.query, input.page);
        }
        throw error;
      }
    },

    async getBySlug(slug): Promise<AnimeDetail> {
      const row = getAnimeRowBySlug(slug);
      if (row && isRowFresh(row) && hasEpisodes(row.id)) {
        return assembleDetailFromDb(row);
      }
      try {
        const detail = await source.getAnimeBySlug(slug);
        saveDetail(detail);
        const saved = getAnimeRowBySlug(slug);
        if (!saved) {
          throw new NotFoundError(`Anime non trovato: ${slug}`);
        }
        return {
          ...assembleDetailFromDb(saved),
          relatedAnime: detail.relatedAnime,
          recommendations: detail.recommendations,
        };
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw error;
        }
        if (error instanceof ApiError && error.status === 404) {
          throw new NotFoundError(`Anime non trovato: ${slug}`);
        }
        // Serviamo il DB solo se ha davvero gli episodi: una riga senza episodi darebbe
        // un falso "Nessun episodio disponibile", mascherando l'errore reale della source.
        if (row && hasEpisodes(row.id)) {
          logger.warn({ err: error, slug }, 'Source non raggiungibile, servo il dettaglio dal DB');
          return assembleDetailFromDb(row);
        }
        throw error;
      }
    },

    async byGenre(genreSlug, page): Promise<PaginatedAnime> {
      const matching = db
        .select({ animeId: schema.animeGenre.animeId })
        .from(schema.animeGenre)
        .innerJoin(schema.genre, eq(schema.animeGenre.genreId, schema.genre.id))
        .where(eq(schema.genre.slug, genreSlug));
      return queryAnime(inArray(schema.anime.id, matching), page);
    },

    async bySeason(season, year, page): Promise<PaginatedAnime> {
      return queryAnime(
        and(eq(schema.anime.season, season), eq(schema.anime.seasonYear, year)),
        page,
      );
    },

    async byYear(year, page): Promise<PaginatedAnime> {
      return queryAnime(eq(schema.anime.seasonYear, year), page);
    },

    async recent(page): Promise<PaginatedAnime> {
      return queryAnime(undefined, page, desc(schema.anime.createdAt));
    },

    async topRated(page): Promise<PaginatedAnime> {
      return queryAnime(
        undefined,
        page,
        sql`${schema.anime.score} IS NULL, ${schema.anime.score} DESC`,
      );
    },

    async browse(input): Promise<PaginatedAnime> {
      return queryAnime(buildBrowseWhere(input), input.page, orderByForSort(input.sort));
    },

    async filters(): Promise<CatalogFilters> {
      const genreRows = db
        .select({
          id: schema.genre.id,
          slug: schema.genre.slug,
          name: schema.genre.name,
          nameEng: schema.genre.nameEng,
          malId: schema.genre.malId,
        })
        .from(schema.genre)
        .orderBy(asc(schema.genre.name))
        .all();
      const yearRows = db
        .select({ year: schema.anime.seasonYear })
        .from(schema.anime)
        .where(sql`${schema.anime.seasonYear} IS NOT NULL`)
        .orderBy(desc(schema.anime.seasonYear))
        .all();
      const years = [...new Set(yearRows.map((r) => r.year).filter((y): y is number => y != null))];
      const genres: GenreDetail[] = genreRows.map((g) => ({
        id: g.id,
        slug: g.slug,
        name: g.name,
        nameEng: g.nameEng ?? null,
        malId: g.malId ?? null,
      }));
      return { genres, years };
    },

    async syncCatalog(): Promise<{ synced: number }> {
      if (syncRunning) {
        return { synced: 0 };
      }
      syncRunning = true;
      try {
        let page = 1;
        let synced = 0;
        for (;;) {
          const result = await source.searchAnime('', page);
          for (const summary of result.data) {
            upsertSummary(summary);
          }
          synced += result.data.length;
          if (!result.meta.hasMore || result.data.length === 0) {
            break;
          }
          page++;
        }
        setLastSyncedAt(now().toISOString());
        logger.info({ synced }, 'Sync catalogo completato');
        return { synced };
      } finally {
        syncRunning = false;
      }
    },

    syncStatus(): SyncStatus {
      return { running: syncRunning, lastSyncedAt: getLastSyncedAt() };
    },

    async listEpisodes(animeSlug): Promise<EpisodeSummary[]> {
      const detail = await this.getBySlug(animeSlug);
      return detail.episodes;
    },

    async getEpisodeFile(episodeFileId): Promise<EpisodeDetail> {
      const fileRow = db
        .select()
        .from(schema.episodeFile)
        .where(eq(schema.episodeFile.id, episodeFileId))
        .get();
      if (!fileRow) {
        throw new NotFoundError(`Episodio non trovato: ${episodeFileId}`);
      }
      const epRow = db
        .select()
        .from(schema.episode)
        .where(eq(schema.episode.id, fileRow.episodeId))
        .get();
      const animeRow = epRow
        ? db.select().from(schema.anime).where(eq(schema.anime.id, epRow.animeId)).get()
        : undefined;
      if (!epRow || !animeRow) {
        throw new NotFoundError(`Episodio non trovato: ${episodeFileId}`);
      }
      let downloadUrl = fileRow.downloadUrl;
      let expiresAt = fileRow.urlExpiresAt;
      if (!downloadUrl) {
        const episodes = await source.getEpisodes(animeRow.slug);
        const match = episodes.find(
          (entry) => entry.number === epRow.number && entry.language === fileRow.language,
        );
        if (!match) {
          throw new NotFoundError(`URL di download non disponibile per ${episodeFileId}`);
        }
        downloadUrl = match.downloadUrl;
        expiresAt = match.expiresAt;
        db.update(schema.episodeFile)
          .set({ downloadUrl, urlExpiresAt: expiresAt, updatedAt: now().toISOString() })
          .where(eq(schema.episodeFile.id, episodeFileId))
          .run();
      }
      return {
        ...toEpisodeSummary(epRow, fileRow),
        downloadUrl,
        expiresAt,
      };
    },

    async getCalendar(): Promise<CalendarWeek> {
      if (calendarCache && now().getTime() - calendarCache.fetchedAt < CALENDAR_TTL_MS) {
        return calendarCache.week;
      }
      const week = await source.getCalendar();
      calendarCache = { fetchedAt: now().getTime(), week };
      return week;
    },

    async getCalendarDay(day): Promise<CalendarEntry> {
      const week = await this.getCalendar();
      const entry = week.find((item) => item.day === day);
      if (!entry) {
        throw new NotFoundError(`Nessuna voce di calendario per ${day}`);
      }
      return entry;
    },
  };
}
