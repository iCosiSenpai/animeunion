import { z } from 'zod';

export const notificationTypeSchema = z.enum([
  'download_complete',
  'download_failed',
  'new_episode',
  'season_available',
  'sync_complete',
  'disk_low',
  'doctor_alert',
  'doctor_resolved',
  'info',
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const notificationSchema = z.object({
  id: z.string(),
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string().nullable(),
  animeId: z.string().nullable(),
  // Slug dell'anime collegato (ricavato con join al volo): per il link "vai alla scheda".
  animeSlug: z.string().nullable(),
  read: z.boolean(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;
