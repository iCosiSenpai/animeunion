import {
  backupListSchema,
  backupRestoreInputSchema,
  backupRestoreResultSchema,
  backupRunResultSchema,
  googleAuthUrlSchema,
  googleBackupResultSchema,
  googleDriveStatusSchema,
  googleExchangeInputSchema,
} from '@animeunion/shared';
import { z } from 'zod';
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

  // --- Backup su Google Drive (bring-your-own OAuth client Desktop, scope drive.file) ---

  googleStatus: publicProcedure
    .output(googleDriveStatusSchema)
    .query(({ ctx }) => ctx.services.cloudBackup.getStatus()),

  googleAuthUrl: publicProcedure
    .output(googleAuthUrlSchema)
    .query(({ ctx }) => ({ url: ctx.services.cloudBackup.buildAuthUrl() })),

  googleExchange: publicProcedure
    .input(googleExchangeInputSchema)
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.services.cloudBackup.exchangeCode(input.code);
      return { ok: true };
    }),

  googleDisconnect: publicProcedure.output(z.object({ ok: z.boolean() })).mutation(({ ctx }) => {
    ctx.services.cloudBackup.disconnect();
    return { ok: true };
  }),

  googleBackupNow: publicProcedure
    .output(googleBackupResultSchema)
    .mutation(({ ctx }) => ctx.services.cloudBackup.uploadLatestBackup()),
});
