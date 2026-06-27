import { jellyfinTestInputSchema, jellyfinTestResultSchema } from '@animeunion/shared';
import { publicProcedure, router } from '../trpc';

/** Integrazione Jellyfin: prova di connessione (il refresh è agganciato agli eventi del worker). */
export const jellyfinRouter = router({
  testConnection: publicProcedure
    .input(jellyfinTestInputSchema)
    .output(jellyfinTestResultSchema)
    .mutation(({ ctx, input }) => ctx.services.jellyfin.testConnection(input ?? {})),
});
