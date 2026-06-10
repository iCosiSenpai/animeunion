import {
  followAddInputSchema,
  followUpdateStatusInputSchema,
  followWithAnimeSchema,
} from '@animeunion/shared';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const followRouter = router({
  list: publicProcedure
    .output(z.array(followWithAnimeSchema))
    .query(({ ctx }) => ctx.services.follow.list()),

  add: publicProcedure
    .input(followAddInputSchema)
    .mutation(({ ctx, input }) => ctx.services.follow.add(input)),

  remove: publicProcedure
    .input(z.object({ animeId: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      ctx.services.follow.remove(input.animeId);
      return { removed: true };
    }),

  updateStatus: publicProcedure
    .input(followUpdateStatusInputSchema)
    .mutation(({ ctx, input }) => ctx.services.follow.updateStatus(input)),
});
