import { z } from 'zod';
import { animeSummarySchema } from './anime';
import { followStatusSchema } from './enums';

export const followSchema = z.object({
  id: z.string(),
  animeId: z.string(),
  status: followStatusSchema,
  notes: z.string().nullable(),
  // null = default in base allo stato (watching = auto-download attivo).
  autoDownload: z.boolean().nullable(),
  addedAt: z.string(),
  updatedAt: z.string(),
  lastCheckAt: z.string().nullable(),
});
export type Follow = z.infer<typeof followSchema>;

export const followWithAnimeSchema = followSchema.extend({
  anime: animeSummarySchema,
});
export type FollowWithAnime = z.infer<typeof followWithAnimeSchema>;

export const followAddInputSchema = z.object({
  animeId: z.string(),
  status: followStatusSchema.default('plan_to_watch'),
  autoDownload: z.boolean().optional(),
});
export type FollowAddInput = z.infer<typeof followAddInputSchema>;

export const followUpdateStatusInputSchema = z.object({
  animeId: z.string(),
  status: followStatusSchema,
});
export type FollowUpdateStatusInput = z.infer<typeof followUpdateStatusInputSchema>;

export const followSetAutoDownloadInputSchema = z.object({
  animeId: z.string(),
  autoDownload: z.boolean(),
});
export type FollowSetAutoDownloadInput = z.infer<typeof followSetAutoDownloadInputSchema>;
