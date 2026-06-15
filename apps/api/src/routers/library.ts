import { historyEntrySchema, watchlistItemSchema } from '@animeunion/shared';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

/** Dati di libreria in sola lettura dal sito: watchlist e cronologia (`/me/*`). */
export const libraryRouter = router({
  watchlist: publicProcedure
    .output(z.array(watchlistItemSchema))
    .query(({ ctx }) => ctx.services.favorites.getWatchlist()),

  history: publicProcedure
    .output(z.array(historyEntrySchema))
    .query(({ ctx }) => ctx.services.favorites.getHistory()),
});
