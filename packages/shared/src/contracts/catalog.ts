import { z } from 'zod';
import { genreDetailSchema, paginatedAnimeSchema } from './anime';
import { animeStatusSchema, animeTypeSchema, languageSchema, seasonSchema } from './enums';

export const catalogSortSchema = z.enum(['recent', 'score', 'title']);
export type CatalogSort = z.infer<typeof catalogSortSchema>;

export const catalogBrowseInputSchema = z.object({
  query: z.string().default(''),
  page: z.number().int().positive().default(1),
  genre: z.string().optional(),
  type: animeTypeSchema.optional(),
  status: animeStatusSchema.optional(),
  year: z.number().int().optional(),
  season: seasonSchema.optional(),
  language: languageSchema.optional(),
  sort: catalogSortSchema.optional(),
});
export type CatalogBrowseInput = z.infer<typeof catalogBrowseInputSchema>;

export const catalogFiltersSchema = z.object({
  genres: z.array(genreDetailSchema),
  years: z.array(z.number().int()),
});
export type CatalogFilters = z.infer<typeof catalogFiltersSchema>;

export const catalogBrowseOutputSchema = paginatedAnimeSchema;
export type CatalogBrowseOutput = z.infer<typeof catalogBrowseOutputSchema>;
