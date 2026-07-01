import { existsSync } from 'node:fs';
import { readdir, realpath, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type {
  Language,
  LibraryDeleteResult,
  LibraryEntry,
  LibraryGroup,
  LibraryScanResult,
  LibraryStats,
  LibraryUnlinkExternalResult,
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
  list(): LibraryGroup[];
  stats(): LibraryStats;
  /** Elimina il file di un singolo episodio (episodio+lingua). */
  deleteEpisodeFile(episodeFileId: string): Promise<LibraryDeleteResult>;
  /** Elimina tutti i file scaricati di un anime in una lingua (una "stagione"). */
  deleteEntry(input: {
    animeId: string;
    language: Language;
    deleteFolder?: boolean;
  }): Promise<LibraryDeleteResult>;
  /** Elimina tutti i file scaricati dell'intera serie/franchise. */
  deleteSeries(input: { animeId: string; deleteFolder?: boolean }): Promise<LibraryDeleteResult>;
  /** Elimina i file orfani indicati (rilevati dalla scansione). */
  deleteOrphans(paths: string[]): Promise<LibraryDeleteResult>;
  /**
   * Scollega i file collegati "senza scaricare" (downloadStatus `external`): li riporta a
   * `not_downloaded` e dimentica il path SENZA toccare i file su disco. Mai sui `downloaded`.
   */
  unlinkExternal(input: {
    episodeFileId?: string;
    animeId?: string;
    language?: Language;
  }): LibraryUnlinkExternalResult;
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

async function walk(dir: string, logger: Logger, maxDepth = 20): Promise<string[]> {
  if (maxDepth <= 0) {
    return [];
  }
  const files: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await walk(fullPath, logger, maxDepth - 1)));
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
  /** File collegato "senza scaricare" (downloadStatus `external`): la scan non lo tocca. */
  external: boolean;
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
        downloadStatus: schema.episodeFile.downloadStatus,
        localPath: schema.episodeFile.localPath,
      })
      .from(schema.episodeFile)
      .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
      .innerJoin(schema.anime, eq(schema.anime.id, schema.episode.animeId))
      .all();

    return rows.map((row) => {
      const language = row.language as Language;
      // Gli external stanno al localPath dell'utente (fuori schema): usalo come path atteso cosi'
      // la scan li ritrova senza marcarli mancanti/orfani.
      const external = row.downloadStatus === 'external';
      const path =
        external && row.localPath
          ? resolve(row.localPath)
          : resolve(
              renamer.computeEpisodePath({
                animeId: row.animeId,
                episodeNumber: row.episodeNumber,
                language,
              }),
            );
      return {
        episodeFileId: row.episodeFileId,
        animeId: row.animeId,
        animeSlug: row.animeSlug,
        animeTitle: row.animeTitle,
        episodeNumber: row.episodeNumber,
        language,
        path,
        external,
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

  /** Percorso reale di un episode_file: il `localPath` salvato (fonte di verita') o, solo se
   *  assente, quello ricalcolato dal renamer. */
  function pathFor(file: typeof schema.episodeFile.$inferSelect): string | null {
    if (file.localPath) {
      return file.localPath;
    }
    const episode = db
      .select()
      .from(schema.episode)
      .where(eq(schema.episode.id, file.episodeId))
      .get();
    if (!episode) {
      return null;
    }
    return renamer.computeEpisodePath({
      animeId: episode.animeId,
      episodeNumber: episode.number,
      language: file.language as Language,
    });
  }

  /**
   * Cancella i file degli episode_file indicati, azzera lo stato e pulisce la coda. Se la
   * cancellazione del file fallisce (o il file resta su disco) l'episode_file NON viene marcato
   * come rimosso (resta tracciato/riprovabile) e si incrementa `failedFiles`.
   */
  async function removeFiles(episodeFileIds: string[]): Promise<LibraryDeleteResult> {
    let deletedFiles = 0;
    let freedBytes = 0;
    let failedFiles = 0;
    for (const id of episodeFileIds) {
      const file = db.select().from(schema.episodeFile).where(eq(schema.episodeFile.id, id)).get();
      if (!file) {
        continue;
      }
      const wasDownloaded = file.downloadStatus === 'downloaded' || file.localPath != null;
      const path = pathFor(file);
      let failed = false;
      if (path) {
        try {
          await deleteFileAndPrune(path, pruneRootFor(path), logger);
          // Conferma che il file sia davvero sparito (un rm fallito silenzioso lascerebbe il NAS sporco).
          const stillThere = await stat(path)
            .then(() => true)
            .catch(() => false);
          failed = stillThere;
        } catch (error) {
          logger.error({ err: error, episodeFileId: id }, 'Eliminazione file libreria fallita');
          failed = true;
        }
      }
      if (failed) {
        failedFiles += 1;
        continue; // non marcare come rimosso: il file e' ancora su disco
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
    return { deletedFiles, freedBytes, failedFiles };
  }

  /** Cartelle "serie" (root + primo segmento) dei localPath dati, confinate sotto una root.
   *  Usa realpath() per risolvere i symlink prima del confronto di confinamento, così un link
   *  che punta fuori dalla root non supera il check. Se realpath fallisce (path inesistente)
   *  si ricade su resolve() (compatibilità con path già rimossi). */
  async function seriesFoldersOf(paths: string[]): Promise<string[]> {
    const rawRoots = config.distinctDownloadRoots().map((r) => resolve(r));
    const roots = await Promise.all(rawRoots.map((r) => realpath(r).catch(() => r)));
    const folders = new Set<string>();
    for (const p of paths) {
      const abs = await realpath(p).catch(() => resolve(p));
      for (const root of roots) {
        if (abs === root || !abs.startsWith(root + sep)) {
          continue;
        }
        const first = relative(root, abs).split(sep)[0];
        if (first && first !== '..' && first !== '.') {
          folders.add(join(root, first));
        }
        break;
      }
    }
    return [...folders];
  }

  /** Rimuove ricorsivamente le cartelle serie derivate dai path dati (file non tracciati/extra
   *  rimasti). Da chiamare DOPO removeFiles: trova solo i leftover. Guardata dal confinamento di
   *  `seriesFoldersOf`. Ritorna i file rimossi e i byte liberati. */
  async function removeSeriesFolders(
    paths: string[],
  ): Promise<{ deletedFiles: number; freedBytes: number }> {
    let deletedFiles = 0;
    let freedBytes = 0;
    for (const folder of await seriesFoldersOf(paths)) {
      try {
        const files = await walk(folder, logger);
        for (const f of files) {
          const info = await stat(f).catch(() => null);
          if (info) {
            freedBytes += Number(info.size);
            deletedFiles += 1;
          }
        }
        await rm(folder, { recursive: true, force: true });
      } catch (error) {
        logger.error({ err: error, folder }, 'Rimozione cartella serie fallita');
      }
    }
    return { deletedFiles, freedBytes };
  }

  /** Risolve i percorsi reali (localPath o ricalcolo) degli episode_file indicati. */
  function collectPaths(episodeFileIds: string[]): string[] {
    const out: string[] = [];
    for (const id of episodeFileIds) {
      const file = db.select().from(schema.episodeFile).where(eq(schema.episodeFile.id, id)).get();
      if (!file) {
        continue;
      }
      const p = pathFor(file);
      if (p) {
        out.push(p);
      }
    }
    return out;
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
      // Root effettivamente presenti su disco: se una manca (NAS/mount staccato) NON resettiamo gli
      // stati dei file che vivono sotto di essa, altrimenti azzereremmo la libreria a disco offline.
      const presentRoots = roots.filter((r) => r && existsSync(resolve(r))).map((r) => resolve(r));
      const rootPresentFor = (p: string): boolean =>
        presentRoots.some((r) => p === r || p.startsWith(r + sep));
      const walked = await Promise.all(roots.map((root) => walk(root, logger)));
      const allFiles = [...new Set(walked.flat())].filter(isVideoFile).map((file) => resolve(file));
      const foundPaths = new Set(allFiles);

      const sizeByPath = new Map<string, number>();
      // Batch da 32: evita di saturare i file descriptor su librerie con centinaia di file.
      const STAT_BATCH = 32;
      for (let i = 0; i < allFiles.length; i += STAT_BATCH) {
        await Promise.all(
          allFiles.slice(i, i + STAT_BATCH).map(async (file) => {
            const info = await stat(file);
            sizeByPath.set(file, Number(info.size));
          }),
        );
      }

      let found = 0;
      let updated = 0;
      const orphanPaths: string[] = [];
      const missingEntries: LibraryScanResult['missingEntries'] = [];

      const now = new Date().toISOString();

      db.transaction((tx) => {
        for (const [path, entry] of expectedByPath) {
          // I file external stanno al localPath dell'utente. Se sono presenti, contano. Se sono
          // spariti dal disco (cancellati fuori app) MA la root e' raggiungibile, li riconciliamo
          // (reset a not_downloaded + segnalati mancanti) cosi' possono essere riscaricati; se la
          // root e' offline non si tocca nulla.
          if (entry.external) {
            if (foundPaths.has(path)) {
              found += 1;
            } else if (rootPresentFor(path)) {
              missingEntries.push({
                animeId: entry.animeId,
                episodeFileId: entry.episodeFileId,
                animeTitle: entry.animeTitle,
                animeSlug: entry.animeSlug,
                seasonNumber: resolver.resolve(entry.animeId).seasonNumber,
                episodeNumber: entry.episodeNumber,
                language: entry.language,
              });
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
          if (!foundPaths.has(path)) {
            missingEntries.push({
              animeId: entry.animeId,
              episodeFileId: entry.episodeFileId,
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
            // Reset solo se la root e' presente: a disco offline non azzeriamo lo stato.
            if (row?.status === 'downloaded' && rootPresentFor(path)) {
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
          downloadStatus: schema.episodeFile.downloadStatus,
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
        // `external` = file dell'utente collegato senza scaricare: conta come "presente" in libreria.
        .where(inArray(schema.episodeFile.downloadStatus, ['downloaded', 'external']))
        .all();

      if (rows.length === 0) {
        return [];
      }

      const animeIds = [...new Set(rows.map((r) => r.animeId))];
      const genresByAnime = loadGenresByAnimeIds(db, animeIds);

      // AnimeSummary del rappresentativo: costruito una volta per animeId.
      const summaryByAnime = new Map<string, ReturnType<typeof toAnimeSummary>>();
      function summaryOf(row: (typeof rows)[number]) {
        const cached = summaryByAnime.get(row.animeId);
        if (cached) {
          return cached;
        }
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
        const summary = toAnimeSummary(
          animeRow as typeof schema.anime.$inferSelect,
          genresByAnime.get(row.animeId) ?? [],
        );
        summaryByAnime.set(row.animeId, summary);
        return summary;
      }

      interface GroupAcc {
        seriesId: string;
        category: 'tv' | 'film';
        entries: Map<string, LibraryEntry>;
        languages: Set<Language>;
        repAnimeId: string;
        repSeason: number;
      }

      // Raggruppa per (categoria, serie): SUB+DUB e stagioni diverse confluiscono insieme.
      const groups = new Map<string, GroupAcc>();
      for (const row of rows) {
        const language = row.language as Language;
        const series = resolver.resolve(row.animeId);
        const category: 'tv' | 'film' = row.animeType === 'MOVIE' ? 'film' : 'tv';
        const groupKey = `${category}:${series.seriesId}`;
        const entryKey = `${row.animeId}:${series.seasonNumber}:${language}`;

        let group = groups.get(groupKey);
        if (!group) {
          group = {
            seriesId: series.seriesId,
            category,
            entries: new Map(),
            languages: new Set(),
            repAnimeId: row.animeId,
            repSeason: series.seasonNumber,
          };
          groups.set(groupKey, group);
        }
        group.languages.add(language);
        // Rappresentativo = stagione base (seasonNumber minore; tie-break animeId minore).
        if (
          series.seasonNumber < group.repSeason ||
          (series.seasonNumber === group.repSeason && row.animeId < group.repAnimeId)
        ) {
          group.repSeason = series.seasonNumber;
          group.repAnimeId = row.animeId;
        }

        let entry = group.entries.get(entryKey);
        if (!entry) {
          entry = {
            animeId: row.animeId,
            seasonNumber: series.seasonNumber,
            language,
            episodes: [],
          };
          group.entries.set(entryKey, entry);
        }
        entry.episodes.push({
          episodeFileId: row.episodeFileId,
          episodeId: row.episodeId,
          episodeNumber: row.episodeNumber,
          episodeTitle: row.episodeTitle ?? null,
          localPath: row.localPath ?? '',
          fileSize: row.fileSize ?? null,
          downloadedAt: row.downloadedAt ?? null,
          language,
          external: row.downloadStatus === 'external',
        });
        // Assicura che il summary del rappresentativo sia disponibile.
        summaryOf(row);
      }

      const languageOrder: Language[] = ['SUB_ITA', 'DUB_ITA'];
      const result: LibraryGroup[] = [];
      for (const group of groups.values()) {
        const entries = [...group.entries.values()];
        for (const entry of entries) {
          entry.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
        }
        entries.sort(
          (a, b) => a.seasonNumber - b.seasonNumber || a.language.localeCompare(b.language),
        );
        let totalEpisodes = 0;
        let totalSizeBytes = 0;
        for (const entry of entries) {
          for (const ep of entry.episodes) {
            totalEpisodes += 1;
            totalSizeBytes += ep.fileSize ?? 0;
          }
        }
        const rep = summaryByAnime.get(group.repAnimeId);
        if (!rep) {
          continue;
        }
        result.push({
          seriesId: group.seriesId,
          category: group.category,
          anime: rep,
          languages: languageOrder.filter((l) => group.languages.has(l)),
          totalEpisodes,
          totalSizeBytes,
          entries,
        });
      }

      return result.sort((a, b) =>
        (a.anime.titleIta ?? a.anime.title).localeCompare(b.anime.titleIta ?? b.anime.title, 'it'),
      );
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
        .where(inArray(schema.episodeFile.downloadStatus, ['downloaded', 'external']))
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

    async deleteEntry({ animeId, language, deleteFolder }) {
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
      const paths = deleteFolder ? collectPaths(ids) : [];
      const result = await removeFiles(ids);
      if (deleteFolder) {
        const folder = await removeSeriesFolders(paths);
        result.deletedFiles += folder.deletedFiles;
        result.freedBytes += folder.freedBytes;
      }
      return result;
    },

    async deleteSeries({ animeId, deleteFolder }) {
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
      const paths = deleteFolder ? collectPaths(ids) : [];
      const result = await removeFiles(ids);
      if (deleteFolder) {
        const folder = await removeSeriesFolders(paths);
        result.deletedFiles += folder.deletedFiles;
        result.freedBytes += folder.freedBytes;
      }
      return result;
    },

    unlinkExternal({ episodeFileId, animeId, language }) {
      // Risolvi solo le righe davvero `external`: la guardia sullo stato impedisce di toccare i
      // file scaricati dall'app (mai cancellati comunque: qui si azzera solo il collegamento).
      let ids: string[] = [];
      if (episodeFileId) {
        ids = db
          .select({ id: schema.episodeFile.id })
          .from(schema.episodeFile)
          .where(
            and(
              eq(schema.episodeFile.id, episodeFileId),
              eq(schema.episodeFile.downloadStatus, 'external'),
            ),
          )
          .all()
          .map((row) => row.id);
      } else if (animeId) {
        const conds = [
          eq(schema.episode.animeId, animeId),
          eq(schema.episodeFile.downloadStatus, 'external'),
        ];
        if (language) {
          conds.push(eq(schema.episodeFile.language, language));
        }
        ids = db
          .select({ id: schema.episodeFile.id })
          .from(schema.episodeFile)
          .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
          .where(and(...conds))
          .all()
          .map((row) => row.id);
      }
      if (ids.length === 0) {
        return { ok: true, unlinked: 0 };
      }
      const ts = new Date().toISOString();
      db.update(schema.episodeFile)
        .set({
          downloadStatus: 'not_downloaded',
          localPath: null,
          fileSize: null,
          downloadedAt: null,
          updatedAt: ts,
        })
        .where(inArray(schema.episodeFile.id, ids))
        .run();
      return { ok: true, unlinked: ids.length };
    },

    async deleteOrphans(paths) {
      let deletedFiles = 0;
      let freedBytes = 0;
      let failedFiles = 0;
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
          failedFiles += 1;
        }
      }
      return { deletedFiles, freedBytes, failedFiles };
    },
  };
}
