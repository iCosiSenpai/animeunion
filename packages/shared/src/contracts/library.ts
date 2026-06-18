import { z } from 'zod';
import { animeSummarySchema } from './anime';
import { languageSchema } from './enums';

export const libraryEpisodeSchema = z.object({
  episodeFileId: z.string(),
  episodeId: z.string(),
  episodeNumber: z.number().int(),
  episodeTitle: z.string().nullable(),
  localPath: z.string(),
  fileSize: z.number().int().nullable(),
  downloadedAt: z.string().nullable(),
  language: languageSchema,
});
export type LibraryEpisode = z.infer<typeof libraryEpisodeSchema>;

export const libraryItemSchema = z.object({
  anime: animeSummarySchema,
  seasonNumber: z.number().int(),
  language: languageSchema,
  episodes: z.array(libraryEpisodeSchema),
});
export type LibraryItem = z.infer<typeof libraryItemSchema>;

export const libraryMissingEntrySchema = z.object({
  animeTitle: z.string().nullable(),
  animeSlug: z.string(),
  seasonNumber: z.number().int(),
  episodeNumber: z.number().int(),
  language: languageSchema,
});
export type LibraryMissingEntry = z.infer<typeof libraryMissingEntrySchema>;

export const libraryScanResultSchema = z.object({
  found: z.number().int(),
  updated: z.number().int(),
  orphans: z.number().int(),
  missing: z.number().int(),
  orphanPaths: z.array(z.string()),
  missingEntries: z.array(libraryMissingEntrySchema),
});
export type LibraryScanResult = z.infer<typeof libraryScanResultSchema>;

export const libraryStatsSchema = z.object({
  totalEpisodes: z.number().int(),
  totalSizeBytes: z.number().int(),
  totalSeries: z.number().int(),
});
export type LibraryStats = z.infer<typeof libraryStatsSchema>;

// Eliminazione file dalla libreria (episodio / stagione / serie).
export const libraryDeleteEpisodeInputSchema = z.object({ episodeFileId: z.string().min(1) });
export const libraryDeleteEntryInputSchema = z.object({
  animeId: z.string().min(1),
  language: languageSchema,
});
export const libraryDeleteSeriesInputSchema = z.object({ animeId: z.string().min(1) });

export const libraryDeleteResultSchema = z.object({
  deletedFiles: z.number().int(),
  freedBytes: z.number().int(),
});
export type LibraryDeleteResult = z.infer<typeof libraryDeleteResultSchema>;
