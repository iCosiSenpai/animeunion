import { readdir, rm, rmdir, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { FileEntry, FileList, FileOpResult } from '@animeunion/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import { atomicMove, deleteFileAndPrune, ensureDir } from '../lib/download-fs';
import { NotFoundError, PreconditionError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import type { ConfigService } from './config-service';
import type { RenamerService } from './renamer-service';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm']);

function isVideo(name: string): boolean {
  const dot = name.lastIndexOf('.');
  return dot >= 0 && VIDEO_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

// Cartelle "extra" alla Jellyfin: i video al loro interno sono sigle/OP/ED/trailer/special,
// non episodi da collegare. Vanno mostrati ma non segnalati come orfani.
const EXTRA_DIR_NAMES = new Set([
  'specials',
  'season 00',
  'extras',
  'backdrops',
  'theme-music',
  'theme music',
  'trailers',
  'featurettes',
  'behind the scenes',
  'deleted scenes',
  'interviews',
  'scenes',
  'shorts',
  'other',
]);

/** Vero se uno dei segmenti del percorso è una cartella extra (case-insensitive). */
function isExtraPath(fullPath: string): boolean {
  return fullPath.split(/[/\\]+/).some((segment) => EXTRA_DIR_NAMES.has(segment.toLowerCase()));
}

// Nomi file/cartella sicuri: niente separatori di percorso né caratteri illegali su NTFS.
const ILLEGAL_NAME = /[/\\:*?"<>|]/;

export interface FileManagerService {
  list(path?: string): Promise<FileList>;
  rename(path: string, newName: string): Promise<FileOpResult>;
  move(path: string, destDir: string): Promise<FileOpResult>;
  remove(path: string): Promise<FileOpResult>;
  mkdir(parent: string, name: string): Promise<FileOpResult>;
  relink(path: string, episodeFileId: string): Promise<FileOpResult>;
  /** Rinomina/sposta i file tracciati sotto `path` secondo lo schema del renamer. */
  renameToScheme(path: string): Promise<FileOpResult>;
  /** Rimuove ricorsivamente le cartelle vuote sotto `path`. */
  pruneEmpty(path: string): Promise<FileOpResult>;
}

export interface FileManagerDeps {
  db: Db;
  config: ConfigService;
  renamer: RenamerService;
  logger: Logger;
}

export function createFileManagerService(deps: FileManagerDeps): FileManagerService {
  const { db, config, renamer, logger } = deps;

  function roots(): string[] {
    return config
      .distinctDownloadRoots()
      .filter(Boolean)
      .map((p) => resolve(p));
  }

  /** Root che contiene `target`, oppure null se fuori da tutte le cartelle configurate. */
  function rootOf(target: string): string | null {
    const abs = resolve(target);
    for (const root of roots()) {
      const rel = relative(root, abs);
      if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
        return root;
      }
    }
    return null;
  }

  /** Garantisce che `target` sia dentro una root configurata; ritorna il path assoluto. */
  function assertInside(target: string): string {
    const abs = resolve(target);
    if (!rootOf(abs)) {
      logger.warn({ target }, 'Operazione file fuori dalle cartelle configurate rifiutata');
      throw new PreconditionError('Percorso fuori dalle cartelle di download configurate.');
    }
    return abs;
  }

  function isRoot(abs: string): boolean {
    return roots().some((r) => r === abs);
  }

  /** Aggiorna episode_file quando un file/cartella tracciato viene rinominato o spostato. */
  function syncMovedPaths(oldAbs: string, newAbs: string): void {
    const rows = db
      .select({ id: schema.episodeFile.id, localPath: schema.episodeFile.localPath })
      .from(schema.episodeFile)
      .all();
    const oldPrefix = oldAbs + sep;
    const ts = new Date().toISOString();
    for (const row of rows) {
      if (!row.localPath) {
        continue;
      }
      const local = resolve(row.localPath);
      let nextPath: string | null = null;
      if (local === oldAbs) {
        nextPath = newAbs;
      } else if (local.startsWith(oldPrefix)) {
        nextPath = newAbs + local.slice(oldAbs.length);
      }
      if (nextPath) {
        db.update(schema.episodeFile)
          .set({ localPath: nextPath, updatedAt: ts })
          .where(eq(schema.episodeFile.id, row.id))
          .run();
      }
    }
  }

  /** Azzera lo stato di download dei file tracciati eliminati. */
  function syncDeletedPaths(removedAbs: string): void {
    const rows = db
      .select({ id: schema.episodeFile.id, localPath: schema.episodeFile.localPath })
      .from(schema.episodeFile)
      .all();
    const prefix = removedAbs + sep;
    const ts = new Date().toISOString();
    for (const row of rows) {
      if (!row.localPath) {
        continue;
      }
      const local = resolve(row.localPath);
      if (local === removedAbs || local.startsWith(prefix)) {
        db.update(schema.episodeFile)
          .set({ downloadStatus: 'not_downloaded', localPath: null, fileSize: null, updatedAt: ts })
          .where(eq(schema.episodeFile.id, row.id))
          .run();
      }
    }
  }

  async function listRoots(): Promise<FileList> {
    const entries: FileEntry[] = [];
    for (const root of roots()) {
      let exists = false;
      try {
        exists = (await stat(root)).isDirectory();
      } catch {
        exists = false;
      }
      if (exists) {
        entries.push({
          name: root,
          path: root,
          type: 'dir',
          size: null,
          episodeFileId: null,
          extra: false,
        });
      }
    }
    return { path: '', parent: null, atRoot: false, entries };
  }

  return {
    async list(path) {
      if (!path || path.trim() === '' || !rootOf(path)) {
        return listRoots();
      }
      const target = assertInside(path);
      const dirents = await readdir(target, { withFileTypes: true }).catch(() => []);

      // Mappa localPath -> episodeFileId per marcare i file tracciati/orfani.
      const tracked = new Map<string, string>();
      for (const row of db
        .select({ id: schema.episodeFile.id, localPath: schema.episodeFile.localPath })
        .from(schema.episodeFile)
        .all()) {
        if (row.localPath) {
          tracked.set(resolve(row.localPath), row.id);
        }
      }

      const entries: FileEntry[] = [];
      for (const d of dirents) {
        if (d.name.startsWith('.') || d.name.includes('.part.')) {
          continue;
        }
        const full = join(target, d.name);
        if (d.isDirectory()) {
          entries.push({
            name: d.name,
            path: full,
            type: 'dir',
            size: null,
            episodeFileId: null,
            extra: isExtraPath(full),
          });
        } else if (d.isFile() && isVideo(d.name)) {
          let size: number | null = null;
          try {
            size = (await stat(full)).size;
          } catch {
            size = null;
          }
          entries.push({
            name: d.name,
            path: full,
            type: 'file',
            size,
            episodeFileId: tracked.get(resolve(full)) ?? null,
            extra: isExtraPath(full),
          });
        }
      }
      entries.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'dir' ? -1 : 1;
        }
        return a.name.localeCompare(b.name, 'it');
      });

      const atRoot = isRoot(target);
      const parent = atRoot ? '' : dirname(target);
      return { path: target, parent, atRoot, entries };
    },

    async rename(path, newName) {
      const target = assertInside(path);
      if (ILLEGAL_NAME.test(newName)) {
        throw new PreconditionError('Il nome contiene caratteri non ammessi.');
      }
      if (isRoot(target)) {
        throw new PreconditionError('Non puoi rinominare una cartella radice.');
      }
      const dest = assertInside(join(dirname(target), newName));
      await atomicMove(target, dest, logger);
      syncMovedPaths(target, dest);
      return { ok: true, path: dest };
    },

    async move(path, destDir) {
      const target = assertInside(path);
      const dir = assertInside(destDir);
      if (isRoot(target)) {
        throw new PreconditionError('Non puoi spostare una cartella radice.');
      }
      let isDir = false;
      try {
        isDir = (await stat(dir)).isDirectory();
      } catch {
        isDir = false;
      }
      if (!isDir) {
        throw new PreconditionError('La destinazione non è una cartella valida.');
      }
      const dest = assertInside(join(dir, basename(target)));
      if (dest === target) {
        return { ok: true, path: dest };
      }
      await atomicMove(target, dest, logger);
      syncMovedPaths(target, dest);
      return { ok: true, path: dest };
    },

    async remove(path) {
      const target = assertInside(path);
      if (isRoot(target)) {
        throw new PreconditionError('Non puoi eliminare una cartella radice.');
      }
      const root = rootOf(target);
      let isDir = false;
      try {
        isDir = (await stat(target)).isDirectory();
      } catch {
        isDir = false;
      }
      if (isDir) {
        await rm(target, { recursive: true, force: true });
        syncDeletedPaths(target);
      } else if (root) {
        await deleteFileAndPrune(target, root, logger);
        syncDeletedPaths(target);
      }
      return { ok: true };
    },

    async mkdir(parent, name) {
      const p = assertInside(parent);
      if (ILLEGAL_NAME.test(name)) {
        throw new PreconditionError('Il nome contiene caratteri non ammessi.');
      }
      const dest = assertInside(join(p, name));
      await ensureDir(dest, logger);
      return { ok: true, path: dest };
    },

    async relink(path, episodeFileId) {
      const target = assertInside(path);
      const row = db
        .select({
          fileId: schema.episodeFile.id,
          language: schema.episodeFile.language,
          number: schema.episode.number,
          animeId: schema.episode.animeId,
        })
        .from(schema.episodeFile)
        .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
        .where(eq(schema.episodeFile.id, episodeFileId))
        .get();
      if (!row) {
        throw new NotFoundError(`Episodio non trovato: ${episodeFileId}`);
      }
      const dest = assertInside(
        renamer.computeEpisodePath({
          animeId: row.animeId,
          episodeNumber: row.number,
          language: row.language as 'SUB_ITA' | 'DUB_ITA',
        }),
      );
      if (dest !== target) {
        await atomicMove(target, dest, logger);
      }
      let size: number | null = null;
      try {
        size = (await stat(dest)).size;
      } catch {
        size = null;
      }
      const ts = new Date().toISOString();
      db.update(schema.episodeFile)
        .set({
          downloadStatus: 'downloaded',
          localPath: dest,
          fileSize: size,
          downloadedAt: ts,
          updatedAt: ts,
        })
        .where(eq(schema.episodeFile.id, episodeFileId))
        .run();
      return { ok: true, path: dest };
    },

    async renameToScheme(path) {
      const target = assertInside(path);
      const prefix = target + sep;
      const rows = db
        .select({
          fileId: schema.episodeFile.id,
          language: schema.episodeFile.language,
          localPath: schema.episodeFile.localPath,
          number: schema.episode.number,
          animeId: schema.episode.animeId,
        })
        .from(schema.episodeFile)
        .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
        .where(eq(schema.episodeFile.downloadStatus, 'downloaded'))
        .all();
      const ts = new Date().toISOString();
      let moved = 0;
      for (const row of rows) {
        if (!row.localPath) {
          continue;
        }
        const local = resolve(row.localPath);
        // Solo i file tracciati che si trovano dentro la cartella richiesta.
        if (local !== target && !local.startsWith(prefix)) {
          continue;
        }
        const dest = assertInside(
          renamer.computeEpisodePath({
            animeId: row.animeId,
            episodeNumber: row.number,
            language: row.language as 'SUB_ITA' | 'DUB_ITA',
          }),
        );
        if (dest === local) {
          continue;
        }
        // Non sovrascrivere un file gia' presente alla destinazione.
        let destExists = false;
        try {
          destExists = (await stat(dest)).isFile();
        } catch {
          destExists = false;
        }
        if (destExists) {
          logger.warn({ local, dest }, 'Rinomina schema: destinazione gia presente, salto');
          continue;
        }
        await atomicMove(local, dest, logger);
        db.update(schema.episodeFile)
          .set({ localPath: dest, updatedAt: ts })
          .where(eq(schema.episodeFile.id, row.fileId))
          .run();
        moved += 1;
      }
      return { ok: true, count: moved };
    },

    async pruneEmpty(path) {
      const target = assertInside(path);
      let removed = 0;
      async function walk(dir: string): Promise<boolean> {
        const dirents = await readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const d of dirents) {
          if (!d.isDirectory()) {
            continue;
          }
          const full = join(dir, d.name);
          const emptied = await walk(full);
          if (emptied) {
            try {
              await rmdir(full);
              removed += 1;
            } catch {
              // ENOTEMPTY/permessi: lascia stare e prosegui.
            }
          }
        }
        const after = await readdir(dir).catch(() => []);
        return after.length === 0;
      }
      await walk(target);
      return { ok: true, count: removed };
    },
  };
}
