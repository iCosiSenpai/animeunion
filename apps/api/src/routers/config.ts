import { configKeySchema, configSetInputSchema } from '@animeunion/shared';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const configRouter = router({
  getAll: publicProcedure.query(({ ctx }) => ctx.services.config.getAll()),

  get: publicProcedure.input(z.object({ key: configKeySchema })).query(({ ctx, input }) => ({
    key: input.key,
    value: ctx.services.config.get(input.key),
  })),

  set: publicProcedure.input(configSetInputSchema).mutation(({ ctx, input }) => ({
    key: input.key,
    value: ctx.services.config.set(input.key, input.value),
  })),

  animePathStatus: publicProcedure.query(({ ctx }) => ctx.services.config.animePathStatus()),
});
