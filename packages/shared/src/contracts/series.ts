import { z } from 'zod';
import { animeTypeSchema, languageSchema } from './enums';

/** Classificazione effettiva ai fini del percorso su disco. */
export const seriesKindSchema = z.enum(['tv', 'movie', 'special']);
export type SeriesKind = z.infer<typeof seriesKindSchema>;

/** Override del tipo salvabile: 'auto' lascia decidere all'euristica. */
export const overrideKindSchema = z.enum(['auto', 'tv', 'movie', 'special']);
export type OverrideKind = z.infer<typeof overrideKindSchema>;

// Stagione/serie/tipo risolti per un anime (euristica/override). Usato dal pannello
// "Organizzazione file" e dal dialog "Classifica e scarica" nel dettaglio.
export const seriesResolvedSchema = z.object({
  animeId: z.string(),
  seasonNumber: z.number().int(),
  // Parte della stagione (1 = parte unica). Più parti sulla stessa stagione hanno
  // numerazione episodi continua (part1 1..N, part2 N+1..).
  partNumber: z.number().int(),
  seriesAnimeId: z.string(),
  seriesSlug: z.string(),
  seriesTitle: z.string(),
  // Classificazione effettiva applicata (dopo override/euristica) e tipo grezzo dall'API.
  kind: seriesKindSchema,
  type: animeTypeSchema,
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
  // Parte della stagione (1..20) per le stagioni divise (War of Underworld part 1/2).
  partNumber: z.number().int().min(1).max(20).nullable().optional(),
  // Tipo forzato dall'utente quando l'auto-rilevamento sbaglia (es. film visto come stagione).
  kind: overrideKindSchema.nullable().optional(),
});
export type SeriesOverrideInput = z.infer<typeof seriesOverrideInputSchema>;

// Anteprima del percorso su disco senza scaricare: pilota il dialog "Classifica e scarica".
export const pathPreviewInputSchema = z.object({
  animeId: z.string(),
  episodeNumber: z.number().int().positive().optional(),
  language: languageSchema.optional(),
  // Parametri ipotetici (non ancora salvati) per l'anteprima dinamica.
  kind: overrideKindSchema.nullable().optional(),
  seasonNumber: z.number().int().min(0).max(99).nullable().optional(),
  seriesAnimeId: z.string().nullable().optional(),
  partNumber: z.number().int().min(1).max(20).nullable().optional(),
});
export type PathPreviewInput = z.infer<typeof pathPreviewInputSchema>;

export const pathPreviewSchema = z.object({
  /** Percorso assoluto calcolato del file. */
  path: z.string(),
  /** Tipo effettivo applicato (per la UI). */
  kind: seriesKindSchema,
});
export type PathPreview = z.infer<typeof pathPreviewSchema>;
