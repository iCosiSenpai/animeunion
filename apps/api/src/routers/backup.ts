import {
  backupListSchema,
  backupRestoreInputSchema,
  backupRestoreResultSchema,
  backupRunResultSchema,
} from '@animeunion/shared';
import { publicProcedure, router } from '../trpc';

/** Backup/ripristino del database SQLite (seguiti, coda, libreria, override). */
export const backupRouter = router({
  list: publicProcedure
    .output(backupListSchema)
    .query(({ ctx }) => ctx.services.backup.listBackups()),

  runNow: publicProcedure
    .output(backupRunResultSchema)
    .mutation(({ ctx }) => ctx.services.backup.runBackup()),

  restore: publicProcedure
    .input(backupRestoreInputSchema)
    .output(backupRestoreResultSchema)
    .mutation(({ ctx, input }) => ctx.services.backup.restoreBackup(input.name)),
});
