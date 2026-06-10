import { animeStatusSchema, animeTypeSchema, languageSchema, seasonSchema } from '@animeunion/shared';
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
  seasonYear: nullableInt,
  score: nullableInt,
  genres: z.array(apiGenreSchema).default([]),
  availableLanguages: z.array(languageSchema).default([]),
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
  season: seasonSchema.nullish().transform((value) => value ?? null),
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

export const apiStatsSchema = z.object({
  totalAnime: z.number().int(),
  totalEpisodes: z.number().int(),
});

export type ApiAnimeSummary = z.infer<typeof apiAnimeSummarySchema>;
export type ApiAnimeDetail = z.infer<typeof apiAnimeDetailSchema>;
export type ApiEpisode = z.infer<typeof apiEpisodeSchema>;
export type ApiRelation = z.infer<typeof apiRelationSchema>;
