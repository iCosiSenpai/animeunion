import { z } from 'zod';
import { downloadStatusSchema, languageSchema } from './enums';

export const downloadQueueItemSchema = z.object({
  id: z.string(),
  episodeFileId: z.string(),
  status: downloadStatusSchema,
  progress: z.number().min(0).max(1),
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

export const downloadActionInputSchema = z.object({
  queueId: z.string(),
});
export type DownloadActionInput = z.infer<typeof downloadActionInputSchema>;

export const downloadEnqueueResultSchema = z.object({
  queueId: z.string(),
  enqueued: z.number().int(),
});
export type DownloadEnqueueResult = z.infer<typeof downloadEnqueueResultSchema>;
