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

// Entry = un (anime, stagione, lingua) con i suoi episodi. Building block leggero del gruppo
// (niente AnimeSummary qui: il rappresentativo sta sul gruppo).
export const libraryEntrySchema = z.object({
  animeId: z.string(),
  seasonNumber: z.number().int(),
  language: languageSchema,
  episodes: z.array(libraryEpisodeSchema),
});
export type LibraryEntry = z.infer<typeof libraryEntrySchema>;

// Gruppo = una card della libreria: una serie/franchise (categoria + seriesId) con lingue e
// stagioni unite. SUB+DUB e stagioni diverse confluiscono nello stesso gruppo.
export const libraryGroupSchema = z.object({
  seriesId: z.string(),
  category: z.enum(['tv', 'film']),
  /** Anime rappresentativo del gruppo: la stagione base (seasonNumber minore). */
  anime: animeSummarySchema,
  /** Lingue aggregate presenti nel gruppo (badge SUB/DUB). */
  languages: z.array(languageSchema),
  totalEpisodes: z.number().int(),
  totalSizeBytes: z.number().int(),
  entries: z.array(libraryEntrySchema),
});
export type LibraryGroup = z.infer<typeof libraryGroupSchema>;

export const libraryMissingEntrySchema = z.object({
  animeId: z.string(),
  episodeFileId: z.string(),
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
  /** Rimuove anche l'intera cartella della serie (compresi file non tracciati/extra). */
  deleteFolder: z.boolean().optional().default(false),
});
export const libraryDeleteSeriesInputSchema = z.object({
  animeId: z.string().min(1),
  deleteFolder: z.boolean().optional().default(false),
});

export const libraryDeleteResultSchema = z.object({
  deletedFiles: z.number().int(),
  freedBytes: z.number().int(),
  /** File che non è stato possibile eliminare (permessi/percorso): NON marcati come rimossi. */
  failedFiles: z.number().int().default(0),
});
export type LibraryDeleteResult = z.infer<typeof libraryDeleteResultSchema>;
