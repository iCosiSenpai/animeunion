import { dashboardStatsSchema } from '@animeunion/shared';
import { count, countDistinct, inArray, sql } from 'drizzle-orm';
import { schema } from '../db';
import { publicProcedure, router } from '../trpc';

export const statsRouter = router({
  dashboard: publicProcedure.output(dashboardStatsSchema).query(({ ctx }) => {
    const { db } = ctx;
    const totalAnime = db.select({ n: count() }).from(schema.anime).get()?.n ?? 0;
    const totalEpisodes = db.select({ n: count() }).from(schema.episode).get()?.n ?? 0;
    // Conteggio per episodio distinto, non per file: SUB/DUB e le varianti upscalate (XQ/XQPLUS)
    // dello stesso episodio sono piu' righe episode_file ma un solo "episodio scaricato".
    const downloadedEpisodes =
      db
        .select({ n: countDistinct(schema.episodeFile.episodeId) })
        .from(schema.episodeFile)
        // Include gli `external` (collegati senza scaricare): contano come episodi presenti.
        .where(inArray(schema.episodeFile.downloadStatus, ['downloaded', 'external']))
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
