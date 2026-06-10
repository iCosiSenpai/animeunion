import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type EpisodeSummary, appConfigSchema } from '@animeunion/shared';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { createMockSource } from '../sources/mock-source';
import { createDb, runMigrations, schema } from './index';

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');
const dbPath = env.DATABASE_PATH;

const DEFAULT_CONFIG = appConfigSchema.parse({});

async function seed(): Promise<void> {
  const db = createDb(dbPath);
  runMigrations(db, migrationsFolder);

  const source = createMockSource();
  const now = new Date().toISOString();

  db.delete(schema.animeGenre).run();
  db.delete(schema.episodeFile).run();
  db.delete(schema.episode).run();
  db.delete(schema.anime).run();
  db.delete(schema.genre).run();
  db.delete(schema.config).run();

  const genres = await source.getGenres();
  for (const genre of genres) {
    db.insert(schema.genre)
      .values({
        id: genre.id,
        slug: genre.slug,
        name: genre.name,
        nameEng: genre.nameEng,
        malId: genre.malId,
      })
      .run();
  }

  const catalog = await source.searchAnime('', 1);
  let animeCount = 0;
  let episodeCount = 0;
  let fileCount = 0;

  for (const summary of await collectAllAnime(source, catalog.meta.total)) {
    const anime = await source.getAnimeBySlug(summary.slug);
    db.insert(schema.anime)
      .values({
        id: anime.id,
        slug: anime.slug,
        title: anime.title,
        titleIta: anime.titleIta,
        titleEng: anime.titleEng,
        titleJpn: anime.titleJpn,
        synopsis: anime.synopsis,
        synopsisEng: anime.synopsisEng,
        type: anime.type,
        status: anime.status,
        season: anime.season,
        seasonYear: anime.seasonYear,
        episodeCount: anime.episodeCount,
        episodeDuration: anime.episodeDuration,
        coverImage: anime.coverImage,
        bannerImage: anime.bannerImage,
        trailerUrl: anime.trailerUrl,
        studio: anime.studio,
        score: anime.score,
        malId: anime.malId,
        anilistId: anime.anilistId,
        languages: JSON.stringify(anime.availableLanguages),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    animeCount++;

    for (const genre of anime.genres) {
      db.insert(schema.animeGenre).values({ animeId: anime.id, genreId: genre.id }).run();
    }

    const byNumber = groupByNumber(anime.episodes);
    for (const [number, entries] of byNumber) {
      const episodeId = `${anime.id}_e${number}`;
      const languages = entries.map((entry) => entry.language);
      const first = entries[0];
      if (!first) {
        continue;
      }
      db.insert(schema.episode)
        .values({
          id: episodeId,
          animeId: anime.id,
          number,
          title: first.title,
          titleIta: first.titleIta,
          thumbnail: first.thumbnail,
          duration: first.duration,
          airDate: first.airDate,
          isFiller: first.isFiller ? 1 : 0,
          languages: JSON.stringify(languages),
          createdAt: now,
          updatedAt: now,
        })
        .run();
      episodeCount++;

      for (const entry of entries) {
        db.insert(schema.episodeFile)
          .values({
            id: `${episodeId}_${entry.language}`,
            episodeId,
            language: entry.language,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        fileCount++;
      }
    }
  }

  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    db.insert(schema.config)
      .values({ key, value: JSON.stringify(value), updatedAt: now })
      .run();
  }

  logger.info(
    { animeCount, episodeCount, fileCount, genreCount: genres.length },
    'Seed completato',
  );
}

async function collectAllAnime(source: ReturnType<typeof createMockSource>, total: number) {
  const all = [] as Awaited<ReturnType<typeof source.searchAnime>>['data'];
  let page = 1;
  while (all.length < total) {
    const result = await source.searchAnime('', page);
    if (result.data.length === 0) {
      break;
    }
    all.push(...result.data);
    if (!result.meta.hasMore) {
      break;
    }
    page++;
  }
  return all;
}

function groupByNumber(episodes: EpisodeSummary[]): Map<number, EpisodeSummary[]> {
  const map = new Map<number, EpisodeSummary[]>();
  for (const episode of episodes) {
    const bucket = map.get(episode.number) ?? [];
    bucket.push(episode);
    map.set(episode.number, bucket);
  }
  return map;
}

seed().catch((error) => {
  logger.error(error, 'Seed fallito');
  process.exit(1);
});
