import { z } from 'zod';
import { animeSummarySchema } from './anime';
import { languageSchema, serverWatchStatusSchema } from './enums';

/**
 * Contratti per i dati utente del sito (endpoint `/me/*`) e per la home (`/ultimi-episodi`,
 * `/in-evidenza`, `/news`) introdotti nella v1.0.3 dell'API AnimeUnion.
 */

// A.1 — Preferiti del sito (lettura). Arricchito da Matteo con slug/title/coverImage.
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

// A.4 — Profilo utente.
export const userProfileSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.string().nullable(),
  createdAt: z.string(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

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
