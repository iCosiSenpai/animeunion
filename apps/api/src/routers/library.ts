import {
  libraryDeleteEntryInputSchema,
  libraryDeleteEpisodeInputSchema,
  libraryDeleteResultSchema,
  libraryDeleteSeriesInputSchema,
  libraryItemSchema,
  libraryScanResultSchema,
  libraryStatsSchema,
} from '@animeunion/shared';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

/** Libreria locale: scansione, lista, statistiche ed eliminazione dei file scaricati. */
export const libraryRouter = router({
  scan: publicProcedure
    .output(libraryScanResultSchema)
    .mutation(({ ctx }) => ctx.services.library.scan()),

  list: publicProcedure
    .output(libraryItemSchema.array())
    .query(({ ctx }) => ctx.services.library.list()),

  stats: publicProcedure
    .output(libraryStatsSchema)
    .query(({ ctx }) => ctx.services.library.stats()),

  deleteEpisode: publicProcedure
    .input(libraryDeleteEpisodeInputSchema)
    .output(libraryDeleteResultSchema)
    .mutation(({ ctx, input }) => ctx.services.library.deleteEpisodeFile(input.episodeFileId)),

  deleteEntry: publicProcedure
    .input(libraryDeleteEntryInputSchema)
    .output(libraryDeleteResultSchema)
    .mutation(({ ctx, input }) => ctx.services.library.deleteEntry(input)),

  deleteSeries: publicProcedure
    .input(libraryDeleteSeriesInputSchema)
    .output(libraryDeleteResultSchema)
    .mutation(({ ctx, input }) => ctx.services.library.deleteSeries(input)),

  deleteOrphans: publicProcedure
    .input(z.object({ paths: z.array(z.string().min(1)) }))
    .output(libraryDeleteResultSchema)
    .mutation(({ ctx, input }) => ctx.services.library.deleteOrphans(input.paths)),
});
