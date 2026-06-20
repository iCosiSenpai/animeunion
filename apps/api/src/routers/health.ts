import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { healthStatusSchema } from '@animeunion/shared';
import { sql } from 'drizzle-orm';
import { schema } from '../db';
import { freeDiskBytes } from '../lib/download-fs';
import { publicProcedure, router } from '../trpc';

const VERSION = (() => {
  try {
    const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? 'dev';
  } catch {
    return 'dev';
  }
})();

export const healthRouter = router({
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
      version: VERSION,
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
