import { historyEntrySchema, watchlistItemSchema } from '@animeunion/shared';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

/** Dati `/me` dal sito AnimeUnion: watchlist e cronologia. */
export const meRouter = router({
  watchlist: publicProcedure
    .output(z.array(watchlistItemSchema))
    .query(({ ctx }) => ctx.services.favorites.getWatchlist()),

  history: publicProcedure
    .output(z.array(historyEntrySchema))
    .query(({ ctx }) => ctx.services.favorites.getHistory()),
});
