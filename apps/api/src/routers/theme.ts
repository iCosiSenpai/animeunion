import { wallpaperSchema } from '@animeunion/shared';
import { z } from 'zod';
import { searchWallpapers } from '../lib/wallhaven';
import { publicProcedure, router } from '../trpc';

/** Proxy verso wallhaven per gli sfondi del tema (il FE non chiama mai servizi esterni). */
export const themeRouter = router({
  searchWallpapers: publicProcedure
    .input(z.object({ query: z.string().optional() }).optional())
    .output(wallpaperSchema.array())
    .query(({ ctx, input }) => searchWallpapers(input?.query, ctx.logger)),
});
