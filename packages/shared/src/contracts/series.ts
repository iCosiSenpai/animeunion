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
  // true = stagione gia' confermata o serie gia' scaricata: niente piu' prompt al download.
  confirmed: z.boolean(),
});
export type SeriesResolved = z.infer<typeof seriesResolvedSchema>;

export const seriesOverrideInputSchema = z.object({
  animeId: z.string(),
  // 0 = Special (cartella "Specials"); 1..99 = stagione normale.
  seasonNumber: z.number().int().min(0).max(99).nullable().optional(),
  seriesAnimeId: z.string().nullable().optional(),
});
export type SeriesOverrideInput = z.infer<typeof seriesOverrideInputSchema>;
