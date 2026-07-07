import { z } from 'zod';

export const languageSchema = z.enum(['SUB_ITA', 'DUB_ITA']);
export type Language = z.infer<typeof languageSchema>;

// Qualita' dell'output del file episodio. `SD` = sorgente 720p scaricata dalla source (default);
// `XQ`/`XQPLUS` = versioni upscalate (Anime4K/libplacebo, engine Step 3). Distingue nell'unique di
// `episode_file` la sorgente dalle upscalate per lo stesso (episodio, lingua): non si sovrascrivono.
export const qualitySchema = z.enum(['SD', 'XQ', 'XQPLUS']);
export type Quality = z.infer<typeof qualitySchema>;

export const animeTypeSchema = z.enum([
  'TV',
  'TV_SHORT',
  'MOVIE',
  'OVA',
  'ONA',
  'SPECIAL',
  'MUSIC',
]);
export type AnimeType = z.infer<typeof animeTypeSchema>;

export const animeStatusSchema = z.enum(['ONGOING', 'COMPLETED', 'UPCOMING']);
export type AnimeStatus = z.infer<typeof animeStatusSchema>;

export const seasonSchema = z.enum(['WINTER', 'SPRING', 'SUMMER', 'FALL']);
export type Season = z.infer<typeof seasonSchema>;

export const followStatusSchema = z.enum([
  'plan_to_watch',
  'watching',
  'on_hold',
  'completed',
  'dropped',
]);
export type FollowStatus = z.infer<typeof followStatusSchema>;

/** Status della watchlist lato server del sito (UPPER_SNAKE). Sola lettura. */
export const serverWatchStatusSchema = z.enum([
  'PLAN_TO_WATCH',
  'WATCHING',
  'ON_HOLD',
  'COMPLETED',
  'DROPPED',
]);
export type ServerWatchStatus = z.infer<typeof serverWatchStatusSchema>;

/** Converte lo status locale (minuscolo) in quello del server (maiuscolo). */
export function toServerWatchStatus(status: FollowStatus): ServerWatchStatus {
  return status.toUpperCase() as ServerWatchStatus;
}

/** Converte lo status del server (maiuscolo) in quello locale (minuscolo). */
export function fromServerWatchStatus(status: ServerWatchStatus): FollowStatus {
  return status.toLowerCase() as FollowStatus;
}

export const downloadStatusSchema = z.enum([
  'queued',
  'downloading',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);
export type DownloadStatus = z.infer<typeof downloadStatusSchema>;

// Stato persistente del file episodio (tabella episode_file), distinto dallo stato della coda.
// `external` = file dell'utente collegato manualmente (gia' presente, fuori dallo schema): conta
// come "presente" in libreria ma e' escluso da download/auto-enqueue/retry (vedi Step 13).
export const episodeFileStatusSchema = z.enum([
  'not_downloaded',
  'downloading',
  'downloaded',
  'failed',
  'external',
]);
export type EpisodeFileStatus = z.infer<typeof episodeFileStatusSchema>;
