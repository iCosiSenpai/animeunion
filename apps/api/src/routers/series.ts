import {
  pathPreviewInputSchema,
  pathPreviewSchema,
  relatedAnimeSchema,
  seriesOverrideInputSchema,
  seriesResolvedSchema,
} from '@animeunion/shared';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

/** Rilevamento stagione/serie (euristica) + override manuale per correggerlo. */
export const seriesRouter = router({
  getResolved: publicProcedure
    .input(z.object({ animeId: z.string() }))
    .output(seriesResolvedSchema)
    .query(({ ctx, input }) => ctx.services.series.getResolved(input.animeId)),

  // Scopre l'intero franchise (stagioni transitive + correlati) partendo da uno slug.
  franchise: publicProcedure
    .input(z.object({ slug: z.string(), maxNodes: z.number().int().positive().max(50).optional() }))
    .output(relatedAnimeSchema.array())
    .query(({ ctx, input }) => ctx.services.series.franchise(input.slug, input.maxNodes)),

  setOverride: publicProcedure
    .input(seriesOverrideInputSchema)
    .output(seriesResolvedSchema)
    .mutation(({ ctx, input }) => ctx.services.series.setOverride(input)),

  clearOverride: publicProcedure
    .input(z.object({ animeId: z.string() }))
    .output(seriesResolvedSchema)
    .mutation(({ ctx, input }) => ctx.services.series.clearOverride(input.animeId)),

  // Anteprima del percorso su disco con parametri ipotetici (per il dialog "Classifica e scarica").
  previewPath: publicProcedure
    .input(pathPreviewInputSchema)
    .output(pathPreviewSchema)
    .query(({ ctx, input }) => ctx.services.series.previewPath(input)),
});
