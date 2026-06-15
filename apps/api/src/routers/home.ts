import { animeSummarySchema, latestEpisodeSchema, newsItemSchema } from '@animeunion/shared';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const homeRouter = router({
  latestEpisodes: publicProcedure
    .input(z.object({ limit: z.number().int().positive().max(50).default(24) }).optional())
    .output(z.array(latestEpisodeSchema))
    .query(({ ctx, input }) => ctx.services.home.latestEpisodes(input?.limit)),

  featured: publicProcedure
    .output(z.array(animeSummarySchema))
    .query(({ ctx }) => ctx.services.home.featured()),

  news: publicProcedure
    .input(z.object({ limit: z.number().int().positive().max(20).default(5) }).optional())
    .output(z.array(newsItemSchema))
    .query(({ ctx, input }) => ctx.services.home.news(input?.limit)),
});
