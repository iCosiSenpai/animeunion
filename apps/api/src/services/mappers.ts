import {
  type AnimeSummary,
  type EpisodeSummary,
  type GenreSummary,
  type Language,
  animeStatusSchema,
  animeTypeSchema,
  episodeFileStatusSchema,
  languageSchema,
} from '@animeunion/shared';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db';
import { schema } from '../db';

export type AnimeRow = typeof schema.anime.$inferSelect;
export type EpisodeRow = typeof schema.episode.$inferSelect;
export type EpisodeFileRow = typeof schema.episodeFile.$inferSelect;

const languagesJsonSchema = z.array(languageSchema);

export function parseLanguages(json: string | null): Language[] {
  if (!json) {
    return [];
  }
  try {
    const parsed = languagesJsonSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function toAnimeSummary(row: AnimeRow, genres: GenreSummary[]): AnimeSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    titleIta: row.titleIta,
    coverImage: row.coverImage,
    type: animeTypeSchema.parse(row.type),
    status: animeStatusSchema.parse(row.status),
    season: row.season as AnimeSummary['season'],
    seasonYear: row.seasonYear,
    score: row.score,
    genres,
    availableLanguages: parseLanguages(row.languages),
    seriesId: row.seriesId,
    seasonNumber: row.seasonNumber,
  };
}

export function loadGenresByAnimeIds(db: Db, animeIds: string[]): Map<string, GenreSummary[]> {
  const map = new Map<string, GenreSummary[]>();
  if (animeIds.length === 0) {
    return map;
  }
  const rows = db
    .select({
      animeId: schema.animeGenre.animeId,
      id: schema.genre.id,
      slug: schema.genre.slug,
      name: schema.genre.name,
    })
    .from(schema.animeGenre)
    .innerJoin(schema.genre, eq(schema.animeGenre.genreId, schema.genre.id))
    .where(inArray(schema.animeGenre.animeId, animeIds))
    .all();
  for (const row of rows) {
    const bucket = map.get(row.animeId) ?? [];
    bucket.push({ id: row.id, slug: row.slug, name: row.name });
    map.set(row.animeId, bucket);
  }
  return map;
}

export function toEpisodeSummary(epRow: EpisodeRow, fileRow: EpisodeFileRow): EpisodeSummary {
  return {
    id: fileRow.id,
    animeId: epRow.animeId,
    number: epRow.number,
    title: epRow.title,
    titleIta: epRow.titleIta,
    thumbnail: epRow.thumbnail,
    duration: epRow.duration,
    airDate: epRow.airDate,
    isFiller: epRow.isFiller === 1,
    language: languageSchema.parse(fileRow.language),
    downloadStatus: episodeFileStatusSchema.catch('not_downloaded').parse(fileRow.downloadStatus),
  };
}
