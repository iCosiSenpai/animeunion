import { mkdir, rename, rm, rmdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Logger } from './logger';

/**
 * Utility per il download engine: naming FS-safe e atomicità del rename.
 *
 * Il path finale "full" (sub-ita/dub-ita, serie/stagione, fix sequel) è calcolato da
 * RenamerService. Questo file resta utility di basso livello per `tempPath`, `ensureDir`
 * e `atomicMove`.
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

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export interface TargetPathInput {
  animePath: string;
  animeSlug: string;
  seasonNumber: number;
  episodeNumber: number;
  language: string;
  ext: string;
}

export function targetPath(input: TargetPathInput): string {
  const dir = join(
    input.animePath,
    sanitizeSlugForFs(input.animeSlug),
    `Season ${pad2(input.seasonNumber)}`,
  );
  const langSuffix = input.language ? `.${input.language.toLowerCase()}` : '';
  const file = `S${pad2(input.seasonNumber)}E${pad2(input.episodeNumber)}${langSuffix}.${input.ext}`;
  return join(dir, file);
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
    logger?.warn({ filePath, rootPath }, 'Eliminazione fuori da animePath rifiutata');
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
