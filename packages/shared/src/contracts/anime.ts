import { z } from 'zod';
import { animeStatusSchema, animeTypeSchema, languageSchema, seasonSchema } from './enums';
import { episodeSummarySchema } from './episode';

export const genreSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
});
export type GenreSummary = z.infer<typeof genreSummarySchema>;

export const genreDetailSchema = genreSummarySchema.extend({
  nameEng: z.string().nullable(),
  malId: z.number().int().nullable(),
});
export type GenreDetail = z.infer<typeof genreDetailSchema>;

export const animeSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  titleIta: z.string().nullable(),
  coverImage: z.string().nullable(),
  type: animeTypeSchema,
  status: animeStatusSchema,
  season: seasonSchema.nullable(),
  seasonYear: z.number().int().nullable(),
  score: z.number().int().nullable(),
  genres: z.array(genreSummarySchema),
  availableLanguages: z.array(languageSchema),
  seriesId: z.string().nullable(),
  seasonNumber: z.number().int().nullable(),
});
export type AnimeSummary = z.infer<typeof animeSummarySchema>;

export const relatedAnimeSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  titleIta: z.string().nullable(),
  coverImage: z.string().nullable(),
  type: animeTypeSchema,
  seasonYear: z.number().int().nullable(),
  relationType: z.string(),
  seriesId: z.string().nullable(),
  seasonNumber: z.number().int().nullable(),
});
export type RelatedAnime = z.infer<typeof relatedAnimeSchema>;

export const animeDetailSchema = animeSummarySchema.extend({
  titleEng: z.string().nullable(),
  titleJpn: z.string().nullable(),
  synopsis: z.string().nullable(),
  synopsisEng: z.string().nullable(),
  bannerImage: z.string().nullable(),
  trailerUrl: z.string().nullable(),
  studio: z.string().nullable(),
  episodeCount: z.number().int(),
  episodeDuration: z.number().int().nullable(),
  malId: z.number().int().nullable(),
  anilistId: z.number().int().nullable(),
  season: seasonSchema.nullable(),
  genres: z.array(genreDetailSchema),
  relatedAnime: z.array(relatedAnimeSchema),
  recommendations: z.array(animeSummarySchema),
  episodes: z.array(episodeSummarySchema),
});
export type AnimeDetail = z.infer<typeof animeDetailSchema>;

export const paginatedAnimeSchema = z.object({
  data: z.array(animeSummarySchema),
  meta: z.object({
    page: z.number().int(),
    perPage: z.number().int(),
    total: z.number().int(),
    hasMore: z.boolean(),
  }),
});
export type PaginatedAnime = z.infer<typeof paginatedAnimeSchema>;

export const animeSearchInputSchema = z.object({
  query: z.string().min(1),
  page: z.number().int().positive().default(1),
  genre: z.string().optional(),
  type: animeTypeSchema.optional(),
  status: animeStatusSchema.optional(),
  year: z.number().int().optional(),
  season: seasonSchema.optional(),
});
export type AnimeSearchInput = z.infer<typeof animeSearchInputSchema>;
