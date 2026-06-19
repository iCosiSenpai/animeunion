import { readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type {
  Language,
  LibraryDeleteResult,
  LibraryItem,
  LibraryScanResult,
  LibraryStats,
} from '@animeunion/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import { deleteFileAndPrune } from '../lib/download-fs';
import type { Logger } from '../lib/logger';
import type { ConfigService } from './config-service';
import { loadGenresByAnimeIds, toAnimeSummary } from './mappers';
import type { RenamerService } from './renamer-service';
import type { SeriesResolver } from './series-resolver';

export interface LibraryService {
  scan(): Promise<LibraryScanResult>;
  list(): LibraryItem[];
  stats(): LibraryStats;
  /** Elimina il file di un singolo episodio (episodio+lingua). */
  deleteEpisodeFile(episodeFileId: string): Promise<LibraryDeleteResult>;
  /** Elimina tutti i file scaricati di un anime in una lingua (una "stagione"). */
  deleteEntry(input: { animeId: string; language: Language }): Promise<LibraryDeleteResult>;
  /** Elimina tutti i file scaricati dell'intera serie/franchise. */
  deleteSeries(input: { animeId: string }): Promise<LibraryDeleteResult>;
  /** Elimina i file orfani indicati (rilevati dalla scansione). */
  deleteOrphans(paths: string[]): Promise<LibraryDeleteResult>;
}

export interface LibraryServiceDeps {
  db: Db;
  config: ConfigService;
  renamer: RenamerService;
  resolver: SeriesResolver;
  logger: Logger;
}

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm']);

function isVideoFile(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(ext)) {
    return false;
  }
  // File parziali del download engine non sono libreria.
  return !filePath.includes('.part.');
}

async function walk(dir: string, logger: Logger): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await walk(fullPath, logger)));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return [];
    }
    logger.error({ err, dir }, 'Errore scansione cartella libreria');
    throw error;
  }
  return files;
}

interface ExpectedEntry {
  episodeFileId: string;
  animeId: string;
  animeSlug: string;
  animeTitle: string | null;
  episodeNumber: number;
  language: Language;
  path: string;
}

export function createLibraryService(deps: LibraryServiceDeps): LibraryService {
  const { db, config, renamer, resolver, logger } = deps;

  function buildExpectedEntries(): ExpectedEntry[] {
    const rows = db
      .select({
        episodeFileId: schema.episodeFile.id,
        episodeId: schema.episode.id,
        animeId: schema.anime.id,
        animeSlug: schema.anime.slug,
        animeTitle: schema.anime.title,
        episodeNumber: schema.episode.number,
        language: schema.episodeFile.language,
      })
      .from(schema.episodeFile)
      .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
      .innerJoin(schema.anime, eq(schema.anime.id, schema.episode.animeId))
      .all();

    return rows.map((row) => {
      const language = row.language as Language;
      return {
        episodeFileId: row.episodeFileId,
        animeId: row.animeId,
        animeSlug: row.animeSlug,
        animeTitle: row.animeTitle,
        episodeNumber: row.episodeNumber,
        language,
        path: resolve(
          renamer.computeEpisodePath({
            animeId: row.animeId,
            episodeNumber: row.episodeNumber,
            language,
          }),
        ),
      };
    });
  }

  /** Root da usare per il pruning delle cartelle vuote: quella che contiene il file. */
  function pruneRootFor(filePath: string): string {
    const abs = resolve(filePath);
    for (const root of config.distinctDownloadRoots()) {
      const absRoot = resolve(root);
      if (abs === absRoot || abs.startsWith(absRoot + sep)) {
        return root;
      }
    }
    return dirname(abs); // fallback: nessun pruning oltre la cartella diretta
  }

  /** Cancella i file degli episode_file indicati, azzera lo stato e pulisce la coda. */
  async function removeFiles(episodeFileIds: string[]): Promise<LibraryDeleteResult> {
    let deletedFiles = 0;
    let freedBytes = 0;
    for (const id of episodeFileIds) {
      const file = db.select().from(schema.episodeFile).where(eq(schema.episodeFile.id, id)).get();
      if (!file) {
        continue;
      }
      const wasDownloaded = file.downloadStatus === 'downloaded' || file.localPath != null;
      let path = file.localPath;
      if (!path) {
        const episode = db
          .select()
          .from(schema.episode)
          .where(eq(schema.episode.id, file.episodeId))
          .get();
        if (episode) {
          path = renamer.computeEpisodePath({
            animeId: episode.animeId,
            episodeNumber: episode.number,
            language: file.language as Language,
          });
        }
      }
      if (path) {
        try {
          await deleteFileAndPrune(path, pruneRootFor(path), logger);
        } catch (error) {
          logger.error({ err: error, episodeFileId: id }, 'Eliminazione file libreria fallita');
        }
      }
      const now = new Date().toISOString();
      db.update(schema.episodeFile)
        .set({
          downloadStatus: 'not_downloaded',
          localPath: null,
          fileSize: null,
          downloadedAt: null,
          updatedAt: now,
        })
        .where(eq(schema.episodeFile.id, id))
        .run();
      db.delete(schema.downloadQueue).where(eq(schema.downloadQueue.episodeFileId, id)).run();
      if (wasDownloaded) {
        deletedFiles += 1;
        freedBytes += file.fileSize ?? 0;
      }
    }
    return { deletedFiles, freedBytes };
  }

  return {
    async scan() {
      const expected = buildExpectedEntries();
      const expectedByPath = new Map<string, ExpectedEntry>();
      for (const entry of expected) {
        expectedByPath.set(entry.path, entry);
      }

      // Scansiona tutte le cartelle radice distinte configurate.
      const roots = config.distinctDownloadRoots();
      const walked = await Promise.all(roots.map((root) => walk(root, logger)));
      const allFiles = [...new Set(walked.flat())].filter(isVideoFile).map((file) => resolve(file));
      const foundPaths = new Set(allFiles);

      const sizeByPath = new Map<string, number>();
      await Promise.all(
        allFiles.map(async (file) => {
          const info = await stat(file);
          sizeByPath.set(file, Number(info.size));
        }),
      );

      let found = 0;
      let updated = 0;
      const orphanPaths: string[] = [];
      const missingEntries: LibraryScanResult['missingEntries'] = [];

      const now = new Date().toISOString();

      db.transaction((tx) => {
        for (const [path, entry] of expectedByPath) {
          if (!foundPaths.has(path)) {
            missingEntries.push({
              animeTitle: entry.animeTitle,
              animeSlug: entry.animeSlug,
              seasonNumber: resolver.resolve(entry.animeId).seasonNumber,
              episodeNumber: entry.episodeNumber,
              language: entry.language,
            });
            const row = tx
              .select({ status: schema.episodeFile.downloadStatus })
              .from(schema.episodeFile)
              .where(eq(schema.episodeFile.id, entry.episodeFileId))
              .get();
            if (row?.status === 'downloaded') {
              tx.update(schema.episodeFile)
                .set({
                  downloadStatus: 'not_downloaded',
                  localPath: null,
                  downloadedAt: null,
                  updatedAt: now,
                })
                .where(eq(schema.episodeFile.id, entry.episodeFileId))
                .run();
              updated += 1;
            }
            continue;
          }

          found += 1;
          const row = tx
            .select({
              status: schema.episodeFile.downloadStatus,
              localPath: schema.episodeFile.localPath,
              fileSize: schema.episodeFile.fileSize,
              downloadedAt: schema.episodeFile.downloadedAt,
            })
            .from(schema.episodeFile)
            .where(eq(schema.episodeFile.id, entry.episodeFileId))
            .get();

          const size = sizeByPath.get(path);
          if (
            !row ||
            row.status !== 'downloaded' ||
            row.localPath !== path ||
            row.fileSize == null ||
            size == null
          ) {
            tx.update(schema.episodeFile)
              .set({
                downloadStatus: 'downloaded',
                localPath: path,
                fileSize: size ?? row?.fileSize ?? 0,
                downloadedAt: row?.downloadedAt ?? now,
                updatedAt: now,
              })
              .where(eq(schema.episodeFile.id, entry.episodeFileId))
              .run();
            updated += 1;
          }
        }

        for (const file of allFiles) {
          if (!expectedByPath.has(file)) {
            orphanPaths.push(file);
          }
        }
      });

      return {
        found,
        updated,
        orphans: orphanPaths.length,
        missing: missingEntries.length,
        orphanPaths,
        missingEntries,
      };
    },

    list() {
      const rows = db
        .select({
          episodeFileId: schema.episodeFile.id,
          localPath: schema.episodeFile.localPath,
          fileSize: schema.episodeFile.fileSize,
          downloadedAt: schema.episodeFile.downloadedAt,
          language: schema.episodeFile.language,
          episodeId: schema.episode.id,
          episodeNumber: schema.episode.number,
          episodeTitle: schema.episode.title,
          animeId: schema.anime.id,
          animeSlug: schema.anime.slug,
          animeTitle: schema.anime.title,
          animeTitleIta: schema.anime.titleIta,
          animeCoverImage: schema.anime.coverImage,
          animeType: schema.anime.type,
          animeStatus: schema.anime.status,
          animeSeason: schema.anime.season,
          animeSeasonYear: schema.anime.seasonYear,
          animeScore: schema.anime.score,
          animeLanguages: schema.anime.languages,
          animeEpisodeCount: schema.anime.episodeCount,
        })
        .from(schema.episodeFile)
        .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
        .innerJoin(schema.anime, eq(schema.anime.id, schema.episode.animeId))
        .where(eq(schema.episodeFile.downloadStatus, 'downloaded'))
        .all();

      if (rows.length === 0) {
        return [];
      }

      const animeIds = [...new Set(rows.map((r) => r.animeId))];
      const genresByAnime = loadGenresByAnimeIds(db, animeIds);

      const buckets = new Map<string, LibraryItem>();
      for (const row of rows) {
        const language = row.language as Language;
        const series = resolver.resolve(row.animeId);
        const key = `${row.animeId}:${series.seasonNumber}:${language}`;
        let item = buckets.get(key);
        if (!item) {
          const animeRow = {
            id: row.animeId,
            slug: row.animeSlug,
            title: row.animeTitle,
            titleIta: row.animeTitleIta,
            coverImage: row.animeCoverImage,
            type: row.animeType,
            status: row.animeStatus,
            season: row.animeSeason,
            seasonYear: row.animeSeasonYear,
            score: row.animeScore,
            episodeCount: row.animeEpisodeCount,
            languages: row.animeLanguages,
            seriesId: null as string | null,
            seasonNumber: null as number | null,
          };
          // Recupera i generi necessari per AnimeSummary.
          const genres = genresByAnime.get(row.animeId) ?? [];
          item = {
            anime: toAnimeSummary(animeRow as typeof schema.anime.$inferSelect, genres),
            seasonNumber: series.seasonNumber,
            language,
            episodes: [],
          };
          buckets.set(key, item);
        }
        item.episodes.push({
          episodeFileId: row.episodeFileId,
          episodeId: row.episodeId,
          episodeNumber: row.episodeNumber,
          episodeTitle: row.episodeTitle ?? null,
          localPath: row.localPath ?? '',
          fileSize: row.fileSize ?? null,
          downloadedAt: row.downloadedAt ?? null,
          language,
        });
      }

      const result = [...buckets.values()];
      for (const item of result) {
        item.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
      }
      return result.sort((a, b) => {
        const titleCompare = (a.anime.titleIta ?? a.anime.title).localeCompare(
          b.anime.titleIta ?? b.anime.title,
          'it',
        );
        if (titleCompare !== 0) return titleCompare;
        if (a.seasonNumber !== b.seasonNumber) return a.seasonNumber - b.seasonNumber;
        return a.language.localeCompare(b.language);
      });
    },

    stats() {
      const rows = db
        .select({
          fileSize: schema.episodeFile.fileSize,
          animeId: schema.anime.id,
        })
        .from(schema.episodeFile)
        .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
        .innerJoin(schema.anime, eq(schema.anime.id, schema.episode.animeId))
        .where(eq(schema.episodeFile.downloadStatus, 'downloaded'))
        .all();

      let totalSizeBytes = 0;
      const seriesSet = new Set<string>();
      for (const row of rows) {
        totalSizeBytes += row.fileSize ?? 0;
        seriesSet.add(row.animeId);
      }
      return {
        totalEpisodes: rows.length,
        totalSizeBytes,
        totalSeries: seriesSet.size,
      };
    },

    async deleteEpisodeFile(episodeFileId) {
      return removeFiles([episodeFileId]);
    },

    async deleteEntry({ animeId, language }) {
      const ids = db
        .select({ id: schema.episodeFile.id })
        .from(schema.episodeFile)
        .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
        .where(
          and(
            eq(schema.episode.animeId, animeId),
            eq(schema.episodeFile.language, language),
            eq(schema.episodeFile.downloadStatus, 'downloaded'),
          ),
        )
        .all()
        .map((row) => row.id);
      return removeFiles(ids);
    },

    async deleteSeries({ animeId }) {
      const series = resolver.resolve(animeId);
      const animeIds = new Set<string>([animeId]);
      for (const row of db
        .select({ id: schema.anime.id })
        .from(schema.anime)
        .where(eq(schema.anime.seriesId, series.seriesId))
        .all()) {
        animeIds.add(row.id);
      }
      const ids = db
        .select({ id: schema.episodeFile.id })
        .from(schema.episodeFile)
        .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
        .where(
          and(
            inArray(schema.episode.animeId, [...animeIds]),
            eq(schema.episodeFile.downloadStatus, 'downloaded'),
          ),
        )
        .all()
        .map((row) => row.id);
      return removeFiles(ids);
    },

    async deleteOrphans(paths) {
      let deletedFiles = 0;
      let freedBytes = 0;
      for (const path of paths) {
        try {
          const info = await stat(path).catch(() => null);
          const removed = await deleteFileAndPrune(path, pruneRootFor(path), logger);
          if (removed) {
            deletedFiles += 1;
            freedBytes += info ? Number(info.size) : 0;
          }
        } catch (error) {
          logger.error({ err: error, path }, 'Eliminazione orfano fallita');
        }
      }
      return { deletedFiles, freedBytes };
    },
  };
}
