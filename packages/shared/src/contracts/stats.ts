import { z } from 'zod';

export const siteStatsSchema = z.object({
  totalAnime: z.number().int(),
  totalEpisodes: z.number().int(),
});
export type SiteStats = z.infer<typeof siteStatsSchema>;

export const dashboardStatsSchema = z.object({
  totalAnime: z.number().int(),
  totalEpisodes: z.number().int(),
  downloadedEpisodes: z.number().int(),
  followedAnime: z.number().int(),
  totalSizeBytes: z.number().int(),
  downloadQueueSize: z.number().int(),
});
export type DashboardStats = z.infer<typeof dashboardStatsSchema>;
