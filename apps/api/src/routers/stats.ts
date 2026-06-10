import { dashboardStatsSchema } from '@animeunion/shared';
import { count, eq, inArray, sql } from 'drizzle-orm';
import { schema } from '../db';
import { publicProcedure, router } from '../trpc';

export const statsRouter = router({
  dashboard: publicProcedure.output(dashboardStatsSchema).query(({ ctx }) => {
    const { db } = ctx;
    const totalAnime = db.select({ n: count() }).from(schema.anime).get()?.n ?? 0;
    const totalEpisodes = db.select({ n: count() }).from(schema.episode).get()?.n ?? 0;
    const downloadedEpisodes =
      db
        .select({ n: count() })
        .from(schema.episodeFile)
        .where(eq(schema.episodeFile.downloadStatus, 'downloaded'))
        .get()?.n ?? 0;
    const followedAnime = db.select({ n: count() }).from(schema.follow).get()?.n ?? 0;
    const totalSizeBytes =
      db
        .select({ n: sql<number>`COALESCE(SUM(${schema.episodeFile.fileSize}), 0)` })
        .from(schema.episodeFile)
        .get()?.n ?? 0;
    const downloadQueueSize =
      db
        .select({ n: count() })
        .from(schema.downloadQueue)
        .where(inArray(schema.downloadQueue.status, ['queued', 'downloading']))
        .get()?.n ?? 0;
    return {
      totalAnime,
      totalEpisodes,
      downloadedEpisodes,
      followedAnime,
      totalSizeBytes,
      downloadQueueSize,
    };
  }),
});
