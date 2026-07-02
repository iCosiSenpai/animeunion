import type {
  AnimeDetail,
  AnimeSource,
  AnimeSummary,
  CalendarEntry,
  CalendarItem,
  EpisodeDetail,
  Favorite,
  FeaturedAnime,
  GenreDetail,
  HistoryItem,
  LatestEpisode,
  NewsItem,
  PaginatedResult,
  RelatedAnime,
  SiteStats,
  UserProfile,
  WatchlistItem,
  WeekDay,
} from '@animeunion/shared';
import { z } from 'zod';
import { type HttpClient, createHttpClient } from '../lib/http-client';
import {
  type ApiAnimeDetail,
  type ApiAnimeSummary,
  type ApiRelation,
  apiAnimeDetailSchema,
  apiCalendarResponseSchema,
  apiEpisodeSchema,
  apiFavoriteAddResponseSchema,
  apiFavoritesResponseSchema,
  apiFeaturedResponseSchema,
  apiGenreSchema,
  apiHistoryResponseSchema,
  apiLatestEpisodesResponseSchema,
  apiLoginResponseSchema,
  apiMeSchema,
  apiNewsResponseSchema,
  apiPaginatedAnimeSchema,
  apiSourceSchema,
  apiStatsSchema,
  apiWatchlistResponseSchema,
} from './api-schemas';

const SEASONAL_LIMIT = 50;
const SEASONAL_MAX_PAGES = 20;

const WEEK_ORDER: WeekDay[] = [
  'LUNEDI',
  'MARTEDI',
  'MERCOLEDI',
  'GIOVEDI',
  'VENERDI',
  'SABATO',
  'DOMENICA',
];

const DAY_INDEX_TO_WEEKDAY: WeekDay[] = [
  'DOMENICA',
  'LUNEDI',
  'MARTEDI',
  'MERCOLEDI',
  'GIOVEDI',
  'VENERDI',
  'SABATO',
];

export interface ApiSourceOptions {
  baseUrl: string;
  rateLimitMs?: number;
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
}

function toSummary(api: ApiAnimeSummary): AnimeSummary {
  return {
    id: api.id,
    slug: api.slug,
    title: api.title,
    titleIta: api.titleIta,
    coverImage: api.coverImage,
    type: api.type,
    status: api.status,
    season: api.season,
    seasonYear: api.seasonYear,
    score: api.score,
    genres: api.genres.map((genre) => ({ id: genre.id, slug: genre.slug, name: genre.name })),
    availableLanguages: api.availableLanguages,
    seriesId: api.seriesId,
    seasonNumber: api.seasonNumber,
  };
}

function toRelated(api: ApiRelation): RelatedAnime {
  return {
    id: api.id,
    slug: api.slug,
    title: api.title,
    titleIta: api.titleIta,
    coverImage: api.coverImage,
    type: api.type,
    seasonYear: api.seasonYear,
    relationType: api.relationType,
    seriesId: api.seriesId,
    seasonNumber: api.seasonNumber,
  };
}

function toDetail(api: ApiAnimeDetail, episodes: EpisodeDetail[]): AnimeDetail {
  return {
    ...toSummary(api),
    titleEng: api.titleEng,
    titleJpn: api.titleJpn,
    synopsis: api.synopsis,
    synopsisEng: api.synopsisEng,
    bannerImage: api.bannerImage,
    trailerUrl: api.trailerUrl,
    studio: api.studio,
    episodeCount: api.episodeCount,
    episodeDuration: api.episodeDuration,
    malId: api.malId,
    anilistId: api.anilistId,
    season: api.season,
    genres: api.genres,
    relatedAnime: api.relationsFrom.map(toRelated),
    recommendations: api.recommendations.map(toSummary),
    episodes,
  };
}

export function createApiSource(options: ApiSourceOptions): AnimeSource {
  let sessionToken: string | null = null;
  const http: HttpClient = createHttpClient({
    baseUrl: options.baseUrl,
    rateLimitMs: options.rateLimitMs,
    getToken: async () => (options.getToken ? await options.getToken() : null) ?? sessionToken,
  });

  // Parsing resiliente: un episodio o una singola sorgente malformati non devono azzerare
  // l'intera lista. Validiamo per-elemento e scartiamo solo quelli non validi.
  const episodeBaseSchema = apiEpisodeSchema.omit({ sources: true });

  function expandEpisodes(slug: string, animeId: string, raw: unknown): EpisodeDetail[] {
    const data =
      raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)
        ? (raw as { data: unknown[] }).data
        : [];
    const episodes: EpisodeDetail[] = [];
    for (const rawEpisode of data) {
      const base = episodeBaseSchema.safeParse(rawEpisode);
      if (!base.success) {
        continue;
      }
      const episode = base.data;
      const baseId = episode.id ?? `${slug}_e${episode.number}`;
      const rawSources = (rawEpisode as { sources?: unknown }).sources;
      const sources = Array.isArray(rawSources) ? rawSources : [];
      for (const rawSource of sources) {
        const parsedSource = apiSourceSchema.safeParse(rawSource);
        if (!parsedSource.success) {
          continue;
        }
        const source = parsedSource.data;
        episodes.push({
          id: `${baseId}_${source.language}`,
          animeId,
          number: episode.number,
          title: episode.title,
          titleIta: episode.titleIta,
          thumbnail: episode.thumbnail,
          duration: episode.duration,
          airDate: episode.airDate,
          isFiller: episode.isFiller,
          language: source.language,
          downloadUrl: source.url,
          expiresAt: null,
        });
      }
    }
    return episodes;
  }

  return {
    name: 'api',
    baseUrl: options.baseUrl,

    async searchAnime(query: string, page = 1): Promise<PaginatedResult<AnimeSummary>> {
      const raw = await http.get<unknown>('/anime', {
        q: query.trim().length > 0 ? query.trim() : undefined,
        page,
      });
      const parsed = apiPaginatedAnimeSchema.parse(raw);
      const perPage = parsed.meta.perPage ?? parsed.meta.limit ?? parsed.data.length;
      return {
        data: parsed.data.map(toSummary),
        meta: {
          page: parsed.meta.page,
          perPage,
          total: parsed.meta.total,
          hasMore: parsed.meta.hasMore,
        },
      };
    },

    async getAnimeBySlug(slug: string): Promise<AnimeDetail> {
      const [rawDetail, rawEpisodes] = await Promise.all([
        http.get<unknown>(`/anime/${slug}`),
        http.get<unknown>(`/anime/${slug}/episodes`),
      ]);
      const detail = apiAnimeDetailSchema.parse(rawDetail);
      return toDetail(detail, expandEpisodes(slug, detail.id, rawEpisodes));
    },

    async getSeasonalAnime(season: string, year: number): Promise<AnimeSummary[]> {
      const results: AnimeSummary[] = [];
      for (let page = 1; page <= SEASONAL_MAX_PAGES; page++) {
        const raw = await http.get<unknown>('/anime', {
          season,
          year,
          page,
          limit: SEASONAL_LIMIT,
        });
        const parsed = apiPaginatedAnimeSchema.parse(raw);
        results.push(...parsed.data.map(toSummary));
        if (!parsed.meta.hasMore) {
          break;
        }
      }
      return results;
    },

    async getCalendar(): Promise<CalendarEntry[]> {
      const raw = await http.get<unknown>('/calendario');
      const parsed = apiCalendarResponseSchema.parse(raw);
      const byDay = new Map<WeekDay, CalendarItem[]>();
      for (const items of Object.values(parsed.data)) {
        for (const item of items) {
          const day = DAY_INDEX_TO_WEEKDAY[item.dayOfWeek];
          if (!day) {
            continue;
          }
          const list = byDay.get(day) ?? [];
          list.push({
            id: item.anime.id,
            slug: item.anime.slug,
            title: item.anime.title,
            titleIta: item.anime.titleIta,
            coverImage: item.anime.coverImage,
            type: item.anime.type,
            status: item.anime.status,
            season: null,
            seasonYear: item.anime.seasonYear,
            score: item.anime.score,
            genres: [],
            availableLanguages: [],
            seriesId: null,
            seasonNumber: null,
            airTime: item.airTime,
            episodeNumber: item.episodeNumber,
          });
          byDay.set(day, list);
        }
      }
      return WEEK_ORDER.map((day) => ({ day, date: '', anime: byDay.get(day) ?? [] }));
    },

    async getCalendarByDay(day: string): Promise<CalendarEntry> {
      const calendar = await this.getCalendar();
      const entry = calendar.find((item) => item.day === day);
      if (!entry) {
        throw new Error(`Giorno non valido: ${day}`);
      }
      return entry;
    },

    async getGenres(): Promise<GenreDetail[]> {
      const raw = await http.get<unknown>('/genres');
      return z.array(apiGenreSchema).parse(raw);
    },

    async getEpisodes(animeSlug: string): Promise<EpisodeDetail[]> {
      const raw = await http.get<unknown>(`/anime/${animeSlug}/episodes`);
      return expandEpisodes(animeSlug, animeSlug, raw);
    },

    async getStats(): Promise<SiteStats> {
      const raw = await http.get<unknown>('/stats');
      return apiStatsSchema.parse(raw);
    },

    async login(email: string, password: string) {
      const raw = await http.post<unknown>('/auth/login', { email, password });
      const parsed = apiLoginResponseSchema.parse(raw);
      sessionToken = parsed.token;
      return { token: parsed.token, refreshToken: '', user: parsed.user };
    },

    // --- Dati utente del sito (`/me/*`) — v1.0.3 ---

    async getFavorites(updatedSince?: string): Promise<Favorite[]> {
      const raw = await http.get<unknown>('/me/favorites', { updatedSince });
      return apiFavoritesResponseSchema.parse(raw).data;
    },

    async addFavorite(animeId: string): Promise<{ ok: boolean; alreadyExists: boolean }> {
      const raw = await http.post<unknown>('/me/favorites', { animeId });
      const parsed = apiFavoriteAddResponseSchema.parse(raw);
      return { ok: parsed.ok, alreadyExists: parsed.alreadyExists };
    },

    async removeFavorite(animeId: string): Promise<void> {
      await http.del(`/me/favorites/${animeId}`);
    },

    async getWatchlist(updatedSince?: string): Promise<WatchlistItem[]> {
      const raw = await http.get<unknown>('/me/watchlist', { updatedSince });
      return apiWatchlistResponseSchema.parse(raw).data;
    },

    async getHistory(updatedSince?: string): Promise<HistoryItem[]> {
      const raw = await http.get<unknown>('/me/cronologia', { updatedSince });
      return apiHistoryResponseSchema.parse(raw).data;
    },

    async getMe(): Promise<UserProfile> {
      const raw = await http.get<unknown>('/me');
      return apiMeSchema.parse(raw);
    },

    // --- Home del sito ---

    async getLatestEpisodes(limit = 24): Promise<LatestEpisode[]> {
      const raw = await http.get<unknown>('/ultimi-episodi', { limit });
      return apiLatestEpisodesResponseSchema.parse(raw).data;
    },

    async getFeatured(): Promise<FeaturedAnime[]> {
      const raw = await http.get<unknown>('/in-evidenza');
      return apiFeaturedResponseSchema
        .parse(raw)
        .data.map((item) => ({ ...toSummary(item), bannerImage: item.bannerImage ?? null }));
    },

    async getNews(limit = 5): Promise<NewsItem[]> {
      const raw = await http.get<unknown>('/news', { limit });
      return apiNewsResponseSchema.parse(raw).data;
    },
  };
}
