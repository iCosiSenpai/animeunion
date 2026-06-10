import { z } from 'zod';

export const languageSchema = z.enum(['SUB_ITA', 'DUB_ITA']);
export type Language = z.infer<typeof languageSchema>;

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

export const downloadStatusSchema = z.enum([
  'queued',
  'downloading',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);
export type DownloadStatus = z.infer<typeof downloadStatusSchema>;

export const namingFormatSchema = z.enum(['SXXEXX', 'NUMERIC']);
export type NamingFormat = z.infer<typeof namingFormatSchema>;
