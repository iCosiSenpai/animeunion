import { healthStatusSchema } from '@animeunion/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '../db';
import { freeDiskBytes } from '../lib/download-fs';
import { APP_VERSION } from '../lib/version';
import { openProcedure, publicProcedure, router } from '../trpc';

export const healthRouter = router({
  // Firma pubblica per la discovery LAN dell'app worker (lock-exempt, come lock.status): il worker
  // sonda gli host della propria sottorete su /trpc/health.identify per trovare il NAS AnimeUnion.
  // Nessun dato sensibile: solo un marcatore d'app e la versione.
  identify: openProcedure
    .output(z.object({ app: z.literal('animeunion'), version: z.string() }))
    .query(() => ({ app: 'animeunion' as const, version: APP_VERSION })),

  status: publicProcedure.output(healthStatusSchema).query(async ({ ctx }) => {
    const dirsStatus = await ctx.services.config.downloadDirsStatus();
    const dirs = await Promise.all(
      dirsStatus.map(async (d) => ({ ...d, freeBytes: await freeDiskBytes(d.path) })),
    );

    const queue = ctx.services.download.getQueue();
    const active = queue.filter(
      (i) => i.status === 'downloading' || i.status === 'processing',
    ).length;
    const queued = queue.filter((i) => i.status === 'queued').length;
    const failed = queue.filter((i) => i.status === 'failed').length;

    const sync = ctx.services.catalog.syncStatus();
    const totalAnime = ctx.db.select({ n: sql<number>`count(*)` }).from(schema.anime).get()?.n ?? 0;

    return {
      version: APP_VERSION,
      authenticated: ctx.services.auth.status().authenticated,
      worker: {
        paused: ctx.services.download.isQueuePaused(),
        active,
        queued,
        failed,
      },
      catalog: {
        lastSyncedAt: sync.lastSyncedAt ?? null,
        running: sync.running,
        totalAnime,
      },
      dirs,
    };
  }),
});
