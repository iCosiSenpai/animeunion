import type {
  AnimeDetail,
  AnimeSource,
  AnimeSummary,
  CalendarEntry,
  EpisodeDetail,
  GenreDetail,
  PaginatedResult,
  RelatedAnime,
  SiteStats,
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
  apiEpisodesResponseSchema,
  apiGenreSchema,
  apiLoginResponseSchema,
  apiPaginatedAnimeSchema,
  apiStatsSchema,
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
    seasonYear: api.seasonYear,
    score: api.score,
    genres: api.genres.map((genre) => ({ id: genre.id, slug: genre.slug, name: genre.name })),
    availableLanguages: api.availableLanguages,
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

  function expandEpisodes(slug: string, animeId: string, raw: unknown): EpisodeDetail[] {
    const parsed = apiEpisodesResponseSchema.parse(raw);
    const episodes: EpisodeDetail[] = [];
    for (const episode of parsed.data) {
      const baseId = episode.id ?? `${slug}_e${episode.number}`;
      for (const source of episode.sources) {
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
      const byDay = new Map<WeekDay, AnimeSummary[]>();
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
            seasonYear: item.anime.seasonYear,
            score: item.anime.score,
            genres: [],
            availableLanguages: [],
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
  };
}
