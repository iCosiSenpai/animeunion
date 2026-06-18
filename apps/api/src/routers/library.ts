import { libraryItemSchema, libraryScanResultSchema, libraryStatsSchema } from '@animeunion/shared';
import { publicProcedure, router } from '../trpc';

/** Libreria locale: scansione, lista e statistiche dei file scaricati. */
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
});
