import {
  animeStatusSchema,
  animeTypeSchema,
  languageSchema,
  seasonSchema,
  serverWatchStatusSchema,
} from '@animeunion/shared';
import { z } from 'zod';

const nullableString = z
  .string()
  .nullish()
  .transform((value) => value ?? null);

const nullableInt = z
  .number()
  .int()
  .nullish()
  .transform((value) => value ?? null);

const apiGenreInnerSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  nameEng: nullableString,
  malId: nullableInt,
});

export const apiGenreSchema = z.preprocess(
  (value) =>
    value && typeof value === 'object' && 'genre' in value
      ? (value as { genre: unknown }).genre
      : value,
  apiGenreInnerSchema,
);

export const apiAnimeSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  titleIta: nullableString,
  coverImage: nullableString,
  type: animeTypeSchema,
  status: animeStatusSchema,
  season: seasonSchema.nullish().transform((value) => value ?? null),
  seasonYear: nullableInt,
  score: nullableInt,
  genres: z.array(apiGenreSchema).default([]),
  availableLanguages: z.array(languageSchema).default([]),
  seriesId: nullableString,
  seasonNumber: nullableInt,
});

export const apiRelationSchema = z
  .object({
    relationType: z.string(),
    toAnime: z.object({
      id: z.string(),
      slug: z.string(),
      title: z.string(),
      titleIta: nullableString,
      coverImage: nullableString,
      type: animeTypeSchema,
      seasonYear: nullableInt,
      seriesId: nullableString,
      seasonNumber: nullableInt,
    }),
  })
  .transform((relation) => ({
    id: relation.toAnime.id,
    slug: relation.toAnime.slug,
    title: relation.toAnime.title,
    titleIta: relation.toAnime.titleIta,
    coverImage: relation.toAnime.coverImage,
    type: relation.toAnime.type,
    seasonYear: relation.toAnime.seasonYear,
    relationType: relation.relationType,
    seriesId: relation.toAnime.seriesId,
    seasonNumber: relation.toAnime.seasonNumber,
  }));

export const apiAnimeDetailSchema = apiAnimeSummarySchema.extend({
  titleEng: nullableString,
  titleJpn: nullableString,
  synopsis: nullableString,
  synopsisEng: nullableString,
  bannerImage: nullableString,
  trailerUrl: nullableString,
  studio: nullableString,
  episodeCount: z.number().int().default(0),
  episodeDuration: nullableInt,
  malId: nullableInt,
  anilistId: nullableInt,
  relationsFrom: z.array(apiRelationSchema).default([]),
  recommendations: z.array(apiAnimeSummarySchema).default([]),
});

export const apiSourceSchema = z.object({
  language: languageSchema,
  url: z.string().url(),
  format: z.string().default('mp4'),
  quality: z.string().nullish(),
  server: z.string().nullish(),
});

export const apiEpisodeSchema = z.object({
  id: z.string().nullish(),
  number: z.number().int(),
  title: nullableString,
  titleIta: nullableString,
  thumbnail: nullableString,
  duration: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((value) => (value == null ? null : String(value))),
  airDate: nullableString,
  isFiller: z.boolean().default(false),
  languages: z.array(languageSchema).default([]),
  sources: z.array(apiSourceSchema).default([]),
});

export const apiMetaSchema = z.object({
  page: z.number().int(),
  perPage: z.number().int().optional(),
  limit: z.number().int().optional(),
  total: z.number().int(),
  hasMore: z.boolean(),
});

export const apiPaginatedAnimeSchema = z.object({
  data: z.array(apiAnimeSummarySchema).default([]),
  meta: apiMetaSchema,
});

export const apiEpisodesResponseSchema = z.object({
  data: z.array(apiEpisodeSchema).default([]),
});

const apiCalendarAnimeSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  titleIta: nullableString,
  coverImage: nullableString,
  type: animeTypeSchema,
  status: animeStatusSchema,
  seasonYear: nullableInt,
  score: nullableInt,
});

const apiCalendarItemSchema = z.object({
  dayOfWeek: z.number().int(),
  anime: apiCalendarAnimeSchema,
});

export const apiCalendarResponseSchema = z.object({
  data: z.record(z.string(), z.array(apiCalendarItemSchema)),
});

export const apiLoginResponseSchema = z.object({
  token: z.string(),
  expires_in: z.number().int().optional(),
  user: z.unknown(),
});

// --- Social login device flow (v1.1.x) ---

export const apiSocialStartSchema = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri: z.string(),
  verification_uri_complete: z.string(),
  expires_in: z.number().int(),
  interval: z.number().int(),
});

export const apiSocialPollSchema = z.object({
  status: z.enum(['pending', 'slow_down', 'denied', 'expired', 'approved']),
  token: z.string().optional(),
  expires_in: z.number().int().optional(),
  user: z.unknown().optional(),
});

export const apiStatsSchema = z.object({
  totalAnime: z.number().int(),
  totalEpisodes: z.number().int(),
});

// --- Dati utente del sito (`/me/*`) e home (v1.0.3) ---

export const apiFavoriteSchema = z.object({
  animeId: z.string(),
  slug: z.string(),
  title: z.string(),
  coverImage: nullableString,
  addedAt: z.string(),
});

export const apiFavoritesResponseSchema = z.object({
  data: z.array(apiFavoriteSchema).default([]),
});

// POST /me/favorites — 201 { ok, animeId, addedAt } oppure 200 { ok, alreadyExists: true }
export const apiFavoriteAddResponseSchema = z.object({
  ok: z.boolean().default(true),
  alreadyExists: z.boolean().default(false),
  animeId: z.string().optional(),
  addedAt: z.string().optional(),
});

export const apiWatchlistItemSchema = z.object({
  animeId: z.string(),
  slug: z.string(),
  status: serverWatchStatusSchema,
  updatedAt: z.string(),
});

export const apiWatchlistResponseSchema = z.object({
  data: z.array(apiWatchlistItemSchema).default([]),
});

export const apiHistoryItemSchema = z.object({
  animeId: z.string(),
  slug: z.string(),
  episodeNumber: z.number().int(),
  watchedAt: z.string(),
  completed: z.boolean().default(false),
});

export const apiHistoryResponseSchema = z.object({
  data: z.array(apiHistoryItemSchema).default([]),
});

export const apiMeSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  avatarUrl: nullableString,
  role: nullableString,
  createdAt: z.string(),
});

export const apiLatestEpisodeSchema = z.object({
  animeId: z.string(),
  slug: z.string(),
  title: z.string(),
  coverImage: nullableString,
  episodeNumber: z.number().int(),
  language: languageSchema,
  releasedAt: z.string(),
});

export const apiLatestEpisodesResponseSchema = z.object({
  data: z.array(apiLatestEpisodeSchema).default([]),
});

export const apiFeaturedResponseSchema = z.object({
  data: z.array(apiAnimeSummarySchema).default([]),
});

export const apiNewsItemSchema = z.object({
  title: z.string(),
  url: z.string(),
  slug: z.string(),
  image: nullableString,
  excerpt: nullableString,
  publishedAt: z.string(),
});

export const apiNewsResponseSchema = z.object({
  data: z.array(apiNewsItemSchema).default([]),
});

export type ApiAnimeSummary = z.infer<typeof apiAnimeSummarySchema>;
export type ApiAnimeDetail = z.infer<typeof apiAnimeDetailSchema>;
export type ApiEpisode = z.infer<typeof apiEpisodeSchema>;
export type ApiRelation = z.infer<typeof apiRelationSchema>;
