import { z } from 'zod';
import { languageSchema } from './enums';

export const episodeSummarySchema = z.object({
  id: z.string(),
  animeId: z.string(),
  number: z.number().int(),
  title: z.string().nullable(),
  titleIta: z.string().nullable(),
  thumbnail: z.string().nullable(),
  duration: z.string().nullable(),
  airDate: z.string().nullable(),
  isFiller: z.boolean(),
  language: languageSchema,
});
export type EpisodeSummary = z.infer<typeof episodeSummarySchema>;

export const episodeDetailSchema = episodeSummarySchema.extend({
  downloadUrl: z.string().url(),
  expiresAt: z.string().nullable(),
});
export type EpisodeDetail = z.infer<typeof episodeDetailSchema>;
