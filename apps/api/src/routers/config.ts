import { appInfoSchema, configKeySchema, configSetInputSchema } from '@animeunion/shared';
import { z } from 'zod';
import { APP_VERSION } from '../lib/version';
import { publicProcedure, router } from '../trpc';

export const configRouter = router({
  appInfo: publicProcedure.output(appInfoSchema).query(() => ({ version: APP_VERSION })),

  getAll: publicProcedure.query(({ ctx }) => ctx.services.config.getAll()),

  get: publicProcedure.input(z.object({ key: configKeySchema })).query(({ ctx, input }) => ({
    key: input.key,
    value: ctx.services.config.get(input.key),
  })),

  set: publicProcedure.input(configSetInputSchema).mutation(({ ctx, input }) => ({
    key: input.key,
    value: ctx.services.config.set(input.key, input.value),
  })),

  downloadDirs: publicProcedure.query(({ ctx }) => ctx.services.config.downloadDirsStatus()),

  browseDir: publicProcedure
    .input(z.object({ path: z.string().optional() }))
    .query(({ ctx, input }) => ctx.services.config.browseDir(input.path)),
});
