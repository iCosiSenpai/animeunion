import { z } from 'zod';
import { animeSummarySchema } from './anime';
import { languageSchema, serverWatchStatusSchema } from './enums';

/**
 * Contratti per i dati utente del sito (endpoint `/me/*`) e per la home (`/ultimi-episodi`,
 * `/in-evidenza`, `/news`) introdotti nella v1.0.3 dell'API AnimeUnion.
 */

// A.1 — Preferiti del sito (lettura). Include slug/title/coverImage.
export const favoriteSchema = z.object({
  animeId: z.string(),
  slug: z.string(),
  title: z.string(),
  coverImage: z.string().nullable(),
  addedAt: z.string(),
});
export type Favorite = z.infer<typeof favoriteSchema>;

// A.3 — Watchlist del sito (sola lettura).
export const watchlistItemSchema = z.object({
  animeId: z.string(),
  slug: z.string(),
  status: serverWatchStatusSchema,
  updatedAt: z.string(),
});
export type WatchlistItem = z.infer<typeof watchlistItemSchema>;

// A.3 — Cronologia visione (sola lettura).
export const historyItemSchema = z.object({
  animeId: z.string(),
  slug: z.string(),
  episodeNumber: z.number().int(),
  watchedAt: z.string(),
  completed: z.boolean(),
});
export type HistoryItem = z.infer<typeof historyItemSchema>;

/** Cronologia arricchita con titolo/cover dalla cache locale (per la UI "Continua a guardare"). */
export const historyEntrySchema = historyItemSchema.extend({
  title: z.string().nullable(),
  coverImage: z.string().nullable(),
});
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

// A.4 — Stato Premium (da `/me`). `active` e' l'unico campo autorevole per "premium adesso":
// mai ricalcolarlo dall'expiresAt lato client (fusi/clock skew). Il tier non guida mai la policy.
export const premiumTierSchema = z.enum(['FAN', 'MEGA_FAN', 'ULTRA_FAN']);
export type PremiumTier = z.infer<typeof premiumTierSchema>;

export const premiumStatusSchema = z.object({
  tier: premiumTierSchema,
  active: z.boolean(),
  expiresAt: z.string(),
});
export type PremiumStatus = z.infer<typeof premiumStatusSchema>;

// Flag delle funzioni sbloccate dal server. Tollerante: chiavi ignote passano, un flag assente
// e' trattato come false a valle (fail-closed).
export const userFeaturesSchema = z.object({ neuralExport: z.boolean() }).partial().passthrough();
export type UserFeatures = z.infer<typeof userFeaturesSchema>;

// A.4 — Profilo utente. `premium`/`features` sono difensivi: se lo shape del server cambia, il
// campo degrada (null / {}) senza far fallire l'intero parse di `/me` (fail-closed sul gating).
export const userProfileSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.string().nullable(),
  createdAt: z.string(),
  premium: premiumStatusSchema.nullable().default(null).catch(null),
  features: userFeaturesSchema.default({}).catch({}),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

/** Vero solo se l'abbonamento e' attivo adesso (campo autorevole del server). */
export function isPremiumActive(profile: UserProfile | null | undefined): profile is UserProfile {
  return profile?.premium?.active === true;
}

/** Vero solo se il server ha sbloccato il download neurale XQ/XQ+ per questo utente. */
export function hasNeuralExport(profile: UserProfile | null | undefined): boolean {
  return profile?.features?.neuralExport === true;
}

// Catalogo delle feature Premium note all'app oggi. Estendibile: una nuova feature aggiunge una
// voce qui e un ramo in `hasPremiumFeature` (Regola #1: solo le due che esistono adesso).
export const premiumFeatureSchema = z.enum(['concurrentDownloads', 'neuralExport']);
export type PremiumFeature = z.infer<typeof premiumFeatureSchema>;

/**
 * Risolve l'entitlement di una feature Premium dal profilo, riusando gli helper autorevoli.
 * Unico punto in cui "feature -> come si sblocca" è codificato (fail-closed su profilo assente).
 */
export function hasPremiumFeature(
  profile: UserProfile | null | undefined,
  feature: PremiumFeature,
): boolean {
  switch (feature) {
    case 'concurrentDownloads':
      return isPremiumActive(profile);
    case 'neuralExport':
      return hasNeuralExport(profile);
  }
}

// B.1 — Ultimi episodi usciti.
export const latestEpisodeSchema = z.object({
  animeId: z.string(),
  slug: z.string(),
  title: z.string(),
  coverImage: z.string().nullable(),
  episodeNumber: z.number().int(),
  language: languageSchema,
  releasedAt: z.string(),
});
export type LatestEpisode = z.infer<typeof latestEpisodeSchema>;

// B.2 — In evidenza (riusa AnimeSummary).
export const featuredSchema = z.array(animeSummarySchema);
export type Featured = z.infer<typeof featuredSchema>;

// B.3 — News del sito.
export const newsItemSchema = z.object({
  title: z.string(),
  url: z.string(),
  slug: z.string(),
  image: z.string().nullable(),
  excerpt: z.string().nullable(),
  publishedAt: z.string(),
});
export type NewsItem = z.infer<typeof newsItemSchema>;
