import {
  animeDetailSchema,
  catalogBrowseInputSchema,
  catalogFiltersSchema,
  seasonSchema,
  siteStatsSchema,
} from '@animeunion/shared';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

const pageSchema = z.number().int().positive().default(1);
const pagedInputSchema = z.object({ page: pageSchema }).optional();

export const catalogRouter = router({
  search: publicProcedure
    .input(z.object({ query: z.string().default(''), page: pageSchema }))
    .query(({ ctx, input }) => ctx.services.catalog.search(input)),

  bySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .output(animeDetailSchema)
    .query(({ ctx, input }) => ctx.services.catalog.getBySlug(input.slug)),

  byGenre: publicProcedure
    .input(z.object({ genreSlug: z.string().min(1), page: pageSchema }))
    .query(({ ctx, input }) => ctx.services.catalog.byGenre(input.genreSlug, input.page)),

  bySeason: publicProcedure
    .input(z.object({ season: seasonSchema, year: z.number().int(), page: pageSchema }))
    .query(({ ctx, input }) => ctx.services.catalog.bySeason(input.season, input.year, input.page)),

  byYear: publicProcedure
    .input(z.object({ year: z.number().int(), page: pageSchema }))
    .query(({ ctx, input }) => ctx.services.catalog.byYear(input.year, input.page)),

  recent: publicProcedure
    .input(pagedInputSchema)
    .query(({ ctx, input }) => ctx.services.catalog.recent(input?.page ?? 1)),

  topRated: publicProcedure
    .input(pagedInputSchema)
    .query(({ ctx, input }) => ctx.services.catalog.topRated(input?.page ?? 1)),

  browse: publicProcedure
    .input(catalogBrowseInputSchema)
    .query(({ ctx, input }) => ctx.services.catalog.browse(input)),

  filters: publicProcedure
    .output(catalogFiltersSchema)
    .query(({ ctx }) => ctx.services.catalog.filters()),

  sync: publicProcedure.mutation(({ ctx }) => {
    if (ctx.services.catalog.syncStatus().running) {
      return { started: false };
    }
    void ctx.services.catalog
      .syncCatalog()
      .catch((error) => ctx.logger.error({ err: error }, 'Sync catalogo fallito'));
    return { started: true };
  }),

  syncStatus: publicProcedure.query(({ ctx }) => ctx.services.catalog.syncStatus()),

  // Totali onesti del catalogo del sito (dall'API ufficiale). Separata da stats.dashboard perche'
  // e' una chiamata di rete che puo' fallire: null → la UI mostra un placeholder, senza rompere i
  // contatori locali del dashboard.
  siteStats: publicProcedure
    .output(siteStatsSchema.nullable())
    .query(({ ctx }) => ctx.services.catalog.siteStats()),
});
