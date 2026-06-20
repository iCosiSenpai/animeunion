import { seriesOverrideInputSchema, seriesResolvedSchema } from '@animeunion/shared';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

/** Rilevamento stagione/serie (euristica) + override manuale per correggerlo. */
export const seriesRouter = router({
  getResolved: publicProcedure
    .input(z.object({ animeId: z.string() }))
    .output(seriesResolvedSchema)
    .query(({ ctx, input }) => ctx.services.series.getResolved(input.animeId)),

  setOverride: publicProcedure
    .input(seriesOverrideInputSchema)
    .output(seriesResolvedSchema)
    .mutation(({ ctx, input }) => ctx.services.series.setOverride(input)),

  clearOverride: publicProcedure
    .input(z.object({ animeId: z.string() }))
    .output(seriesResolvedSchema)
    .mutation(({ ctx, input }) => ctx.services.series.clearOverride(input.animeId)),
});
