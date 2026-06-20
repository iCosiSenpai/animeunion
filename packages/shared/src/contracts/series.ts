import { z } from 'zod';

// Stagione/serie risolte per un anime (euristica/override). Usato dal pannello
// "Organizzazione file" nel dettaglio per mostrare e correggere il rilevamento.
export const seriesResolvedSchema = z.object({
  animeId: z.string(),
  seasonNumber: z.number().int(),
  seriesAnimeId: z.string(),
  seriesSlug: z.string(),
  seriesTitle: z.string(),
  hasOverride: z.boolean(),
});
export type SeriesResolved = z.infer<typeof seriesResolvedSchema>;

export const seriesOverrideInputSchema = z.object({
  animeId: z.string(),
  seasonNumber: z.number().int().min(1).max(99).nullable().optional(),
  seriesAnimeId: z.string().nullable().optional(),
});
export type SeriesOverrideInput = z.infer<typeof seriesOverrideInputSchema>;
