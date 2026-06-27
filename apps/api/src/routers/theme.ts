import { wallpaperSchema, wallpaperSearchInputSchema } from '@animeunion/shared';
import { searchWallpapers } from '../lib/wallhaven';
import { publicProcedure, router } from '../trpc';

/** Proxy verso wallhaven per gli sfondi del tema (il FE non chiama mai servizi esterni). */
export const themeRouter = router({
  searchWallpapers: publicProcedure
    .input(wallpaperSearchInputSchema.optional())
    .output(wallpaperSchema.array())
    .query(({ ctx, input }) => searchWallpapers(input ?? {}, ctx.logger)),
});
