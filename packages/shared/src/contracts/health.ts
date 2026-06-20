import { z } from 'zod';

export const downloadDirHealthSchema = z.object({
  key: z.string(),
  label: z.string(),
  path: z.string(),
  configured: z.boolean(),
  exists: z.boolean(),
  writable: z.boolean(),
  freeBytes: z.number().nullable(),
});
export type DownloadDirHealth = z.infer<typeof downloadDirHealthSchema>;

export const healthStatusSchema = z.object({
  version: z.string(),
  authenticated: z.boolean(),
  worker: z.object({
    paused: z.boolean(),
    active: z.number().int(),
    queued: z.number().int(),
    failed: z.number().int(),
  }),
  catalog: z.object({
    lastSyncedAt: z.string().nullable(),
    running: z.boolean(),
    totalAnime: z.number().int(),
  }),
  dirs: z.array(downloadDirHealthSchema),
});
export type HealthStatus = z.infer<typeof healthStatusSchema>;
