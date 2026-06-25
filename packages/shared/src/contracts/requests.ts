import { z } from 'zod';
import { languageSchema } from './enums';

// Richiesta in ingresso per la rotta REST `POST /api/integration/requests` (fuori da tRPC: il
// chiamante e un servizio esterno, es. un bot o un'automazione). Ontologia anime-native: l'anime
// si identifica con slug/anilistId/malId/title, non con id TMDB/TVDB.
export const requestInputSchema = z
  .object({
    // Identificatore preferito: match esatto e popola la cache locale.
    slug: z.string().min(1).optional(),
    // Match esatto ma solo contro la cache locale: l'API AnimeUnion non espone lookup per id
    // esterno. Per il match robusto cross-sistema usare `slug` o `title`.
    anilistId: z.number().int().positive().optional(),
    malId: z.number().int().positive().optional(),
    // Match fuzzy via ricerca sull'API; con `season` disambigua la stagione.
    title: z.string().min(1).optional(),
    // Numero di stagione da risolvere quando si usa `title` (1 = prima stagione).
    season: z.number().int().positive().optional(),
    // Lingua da scaricare; se omessa usa la lingua di default in config.
    language: languageSchema.optional(),
    // false = segui soltanto, senza accodare gli episodi gia usciti (default true).
    download: z.boolean().default(true),
  })
  .refine((value) => Boolean(value.slug || value.anilistId || value.malId || value.title), {
    message: 'Specificare almeno uno tra slug, anilistId, malId o title',
  });
export type RequestInput = z.infer<typeof requestInputSchema>;

// Stato di disponibilita di un anime (GET /api/integration/anime/:slug/status): quanti episodi
// sono scaricati rispetto al totale noto in cache. Utile ai caller stile Seerr per "disponibile".
export const requestStatusSchema = z.object({
  slug: z.string(),
  total: z.number().int().nonnegative(),
  downloaded: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
});
export type RequestStatus = z.infer<typeof requestStatusSchema>;

export const requestResultSchema = z.object({
  ok: z.literal(true),
  animeId: z.string(),
  slug: z.string(),
  title: z.string(),
  seasonNumber: z.number().int(),
  // followed = nuovo follow creato; already = l'anime era gia seguito.
  status: z.enum(['followed', 'already']),
  // Episodi accodati da questa richiesta (0 se non ce ne sono di scaricabili o download=false).
  enqueued: z.number().int().nonnegative(),
});
export type RequestResult = z.infer<typeof requestResultSchema>;
