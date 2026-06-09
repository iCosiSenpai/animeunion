import { z } from 'zod';
import { downloadStatusSchema } from './enums';

export const downloadQueueItemSchema = z.object({
  id: z.string(),
  episodeId: z.string(),
  status: downloadStatusSchema,
  progress: z.number().min(0).max(1),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  error: z.string().nullable(),
  retryCount: z.number().int(),
  retryMax: z.number().int(),
  priority: z.number().int().min(0).max(100),
  createdAt: z.string(),
});
export type DownloadQueueItem = z.infer<typeof downloadQueueItemSchema>;

export const downloadAddInputSchema = z.object({
  episodeId: z.string(),
  priority: z.number().int().min(0).max(100).optional(),
});
export type DownloadAddInput = z.infer<typeof downloadAddInputSchema>;

export const downloadActionInputSchema = z.object({
  queueId: z.string(),
});
export type DownloadActionInput = z.infer<typeof downloadActionInputSchema>;
