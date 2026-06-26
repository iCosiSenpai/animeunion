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

// --- Coda gigante: aggregazione server-side + paginazione on-demand (Step 8) ---

// Conteggi globali per stato: evitano di spedire tutte le righe per i badge filtro/widget.
export const downloadCountsSchema = z.object({
  all: z.number().int(),
  queued: z.number().int(),
  downloading: z.number().int(),
  processing: z.number().int(),
  completed: z.number().int(),
  failed: z.number().int(),
  cancelled: z.number().int(),
});
export type DownloadCounts = z.infer<typeof downloadCountsSchema>;

// Riassunto di un gruppo (un anime): conteggi per stato + solo gli item attivi (per la barra/ETA
// live). Le righe complete della coda si caricano on-demand via groupItems.
export const downloadGroupSummarySchema = z.object({
  animeId: z.string(),
  animeTitle: z.string(),
  animeSlug: z.string(),
  animeCoverImage: z.string().nullable(),
  total: z.number().int(),
  queued: z.number().int(),
  downloading: z.number().int(),
  processing: z.number().int(),
  completed: z.number().int(),
  failed: z.number().int(),
  cancelled: z.number().int(),
  activeItems: z.array(downloadQueueItemSchema),
});
export type DownloadGroupSummary = z.infer<typeof downloadGroupSummarySchema>;

export const downloadQueueSummarySchema = z.object({
  groups: z.array(downloadGroupSummarySchema),
  counts: downloadCountsSchema,
});
export type DownloadQueueSummary = z.infer<typeof downloadQueueSummarySchema>;

export const downloadFilterSchema = z.enum(['all', 'active', 'completed', 'failed']);
export type DownloadFilter = z.infer<typeof downloadFilterSchema>;

export const downloadGroupItemsInputSchema = z.object({
  animeId: z.string(),
  filter: downloadFilterSchema.default('all'),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});
export type DownloadGroupItemsInput = z.infer<typeof downloadGroupItemsInputSchema>;

export const downloadQueuePageSchema = z.object({
  items: z.array(downloadQueueItemSchema),
  total: z.number().int(),
});
export type DownloadQueuePage = z.infer<typeof downloadQueuePageSchema>;

export const downloadGroupActionInputSchema = z.object({
  animeId: z.string(),
});
export type DownloadGroupActionInput = z.infer<typeof downloadGroupActionInputSchema>;
