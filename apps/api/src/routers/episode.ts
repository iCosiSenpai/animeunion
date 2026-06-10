import { episodeDetailSchema } from '@animeunion/shared';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const episodeRouter = router({
  byAnime: publicProcedure
    .input(z.object({ animeSlug: z.string().min(1) }))
    .query(({ ctx, input }) => ctx.services.catalog.listEpisodes(input.animeSlug)),

  byId: publicProcedure
    .input(z.object({ episodeId: z.string().min(1) }))
    .output(episodeDetailSchema)
    .query(({ ctx, input }) => ctx.services.catalog.getEpisodeFile(input.episodeId)),
});
