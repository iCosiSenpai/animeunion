import { z } from 'zod';
import { downloadStatusSchema, languageSchema } from './enums';

export const downloadQueueItemSchema = z.object({
  id: z.string(),
  episodeFileId: z.string(),
  status: downloadStatusSchema,
  progress: z.number().min(0).max(1),
  bytesDownloaded: z.number().int(),
  totalBytes: z.number().int().nullable(),
  speedBps: z.number().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  error: z.string().nullable(),
  retryCount: z.number().int(),
  retryMax: z.number().int(),
  priority: z.number().int().min(0).max(100),
  createdAt: z.string(),
  // denormalizzato per la UI
  animeId: z.string(),
  animeTitle: z.string(),
  animeSlug: z.string(),
  animeCoverImage: z.string().nullable(),
  episodeId: z.string(),
  episodeNumber: z.number().int(),
  episodeTitle: z.string().nullable(),
  language: languageSchema,
});
export type DownloadQueueItem = z.infer<typeof downloadQueueItemSchema>;

export const downloadAddInputSchema = z.object({
  episodeFileId: z.string(),
  priority: z.number().int().min(0).max(100).optional(),
});
export type DownloadAddInput = z.infer<typeof downloadAddInputSchema>;

export const downloadAddMissingInputSchema = z.object({
  animeId: z.string(),
  language: languageSchema.optional(),
});
export type DownloadAddMissingInput = z.infer<typeof downloadAddMissingInputSchema>;

// Accoda i mancanti di un anime identificato dallo slug (mette prima gli episodi in cache).
// Usato per scaricare le serie correlate (sequel/prequel/special) dalla pagina dettaglio.
export const downloadAddAllBySlugInputSchema = z.object({
  slug: z.string(),
  language: languageSchema.optional(),
});
export type DownloadAddAllBySlugInput = z.infer<typeof downloadAddAllBySlugInputSchema>;

export const downloadActionInputSchema = z.object({
  queueId: z.string(),
});
export type DownloadActionInput = z.infer<typeof downloadActionInputSchema>;

export const downloadSetPriorityInputSchema = z.object({
  queueId: z.string(),
  priority: z.number().int().min(0).max(100),
});
export type DownloadSetPriorityInput = z.infer<typeof downloadSetPriorityInputSchema>;

// Accoda un episodio identificato da (slug serie, numero, lingua) — usato dalla home
// "Ultimi episodi", dove non si dispone dell'episodeFileId.
export const downloadAddByRefInputSchema = z.object({
  slug: z.string(),
  episodeNumber: z.number().int(),
  language: languageSchema,
  priority: z.number().int().min(0).max(100).optional(),
});
export type DownloadAddByRefInput = z.infer<typeof downloadAddByRefInputSchema>;

export const downloadEnqueueResultSchema = z.object({
  queueId: z.string(),
  enqueued: z.number().int(),
});
export type DownloadEnqueueResult = z.infer<typeof downloadEnqueueResultSchema>;
