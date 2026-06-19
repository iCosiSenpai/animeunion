import { mkdir, readdir, rename, rm, rmdir, statfs } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Logger } from './logger';

/**
 * Utility per il download engine: naming FS-safe e atomicità del rename.
 *
 * Il path finale "full" (serie/film, stagione, fix sequel, routing per lingua) è calcolato da
 * RenamerService. Questo file resta utility di basso livello per `tempPath`, `ensureDir`,
 * `atomicMove`, cancellazione e sweep.
 */

const UNSAFE_CHARS = /[^\p{L}\p{N}\-_ ]/gu;
const COMBINING_MARKS = /\p{M}/gu;

export function sanitizeSlugForFs(slug: string): string {
  return (
    slug
      .normalize('NFKD')
      .replace(COMBINING_MARKS, '')
      .toLowerCase()
      .replace(UNSAFE_CHARS, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 200) || 'anime'
  );
}

// Caratteri non ammessi nei nomi file su Windows/NTFS (più il backslash, codice 92).
const FS_ILLEGAL = new Set(['/', ':', '*', '?', '"', '<', '>', '|', String.fromCharCode(92)]);

/**
 * Nome leggibile FS-safe: rimuove solo i caratteri illegali e di controllo, MANTENENDO
 * spazi, maiuscole e accenti (compatibile con Jellyfin/Plex). Es. "Koori no Jouheki".
 */
export function sanitizeTitleForFs(title: string): string {
  let out = '';
  for (const ch of title) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || FS_ILLEGAL.has(ch)) {
      continue;
    }
    out += ch;
  }
  const cleaned = out
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '') // niente punto/spazio finale (Windows)
    .slice(0, 150)
    .trim();
  return cleaned || 'Anime';
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function tempPath(target: string, queueId: string): string {
  return `${target}.part.${queueId}`;
}

export async function ensureDir(dir: string, logger?: Logger): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return;
    }
    logger?.error({ err: error, dir }, 'Creazione cartella fallita');
    throw error;
  }
}

/**
 * Sposta atomicamente `from` in `to`. Garantisce che la cartella di destinazione esista
 * (creandola ricorsivamente). Su filesystem locali (ext4/ntfs/apfs) `rename` è atomico:
 * il consumer (Jellyfin/Plex) vede o il nome vecchio o quello nuovo, mai un mix.
 */
export async function atomicMove(from: string, to: string, logger?: Logger): Promise<void> {
  await ensureDir(dirname(to), logger);
  await rename(from, to);
}

/**
 * Cancella un file e ripulisce le cartelle padre rimaste vuote, risalendo fino a (escluso)
 * `rootPath`. Opera SOLO se `filePath` è dentro `rootPath` (guardia di sicurezza). Tollerante
 * a file già assenti. Ritorna true se il file esisteva ed è stato rimosso.
 */
export async function deleteFileAndPrune(
  filePath: string,
  rootPath: string,
  logger?: Logger,
): Promise<boolean> {
  const root = resolve(rootPath);
  const target = resolve(filePath);
  const rel = relative(root, target);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    logger?.warn({ filePath, rootPath }, 'Eliminazione fuori dalla cartella di download rifiutata');
    return false;
  }
  let removed = false;
  try {
    await rm(target);
    removed = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger?.error({ err: error, target }, 'Eliminazione file fallita');
      throw error;
    }
  }
  let dir = dirname(target);
  while (dir !== root && dir.startsWith(root)) {
    try {
      await rmdir(dir);
    } catch {
      break; // ENOTEMPTY / ENOENT: ci fermiamo
    }
    dir = dirname(dir);
  }
  return removed;
}

/** Byte liberi sul filesystem che contiene `path`, o null se non determinabile. */
export async function freeDiskBytes(path: string): Promise<number | null> {
  try {
    const stats = await statfs(path);
    return stats.bavail * stats.bsize;
  } catch {
    return null;
  }
}

/**
 * Rimuove i file temporanei `.part.<id>` rimasti sotto `rootPath` (es. dopo un crash a metà
 * download). Ritorna quanti ne ha cancellati. Tollerante a cartella inesistente.
 */
export async function sweepPartFiles(rootPath: string, logger?: Logger): Promise<number> {
  let removed = 0;
  async function walk(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile() && entry.name.includes('.part.')) {
          try {
            await rm(full);
            removed += 1;
          } catch (error) {
            logger?.debug({ err: error, full }, 'Sweep .part: rimozione fallita');
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger?.error({ err: error, dir }, 'Sweep .part: lettura cartella fallita');
      }
    }
  }
  await walk(resolve(rootPath));
  return removed;
}
