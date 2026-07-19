import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { atomicMove, ensureDir } from './download-fs';
import type { Logger } from './logger';

/**
 * Cestino condiviso (soft-delete) usato sia dal Gestore file sia dalla Libreria.
 *
 * Ogni root di download ha una cartella `.trash/` (inizia con '.', quindi già esclusa dal listing).
 * Una voce cestino è una sottocartella `<timestamp>_<hex>` che contiene l'elemento spostato più un
 * `.trashinfo.json` con i metadati per il ripristino. Il pattern `TRASH_ID` vincola gli input di
 * restore (niente path traversal).
 */

// Cartella cestino dentro ogni root configurata. Inizia con '.' → già esclusa dal `list`.
export const TRASH_DIR = '.trash';
export const TRASH_INFO = '.trashinfo.json';
// Id voce cestino sicuro: `<timestamp>_<hex>`. Vincola l'input di restore (no path traversal).
export const TRASH_ID = /^\d+_[a-f0-9]+$/;

export interface TrashInfo {
  originalPath: string;
  name: string;
  deletedAt: string;
  type: 'dir' | 'file';
}

/** Sposta `target` nel cestino della sua `root`, scrivendo i metadati per il ripristino. */
export async function moveToTrash(
  target: string,
  root: string,
  isDir: boolean,
  logger?: Logger,
): Promise<void> {
  const id = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  const entryDir = join(root, TRASH_DIR, id);
  await ensureDir(entryDir, logger);
  const moved = join(entryDir, basename(target));
  await atomicMove(target, moved, logger);
  const info: TrashInfo = {
    originalPath: target,
    name: basename(target),
    deletedAt: new Date().toISOString(),
    type: isDir ? 'dir' : 'file',
  };
  await writeFile(join(entryDir, TRASH_INFO), JSON.stringify(info), 'utf8');
}

/** Legge i metadati di una voce cestino, o null se assenti/corrotti. */
export async function readTrashInfo(entryDir: string): Promise<TrashInfo | null> {
  const raw = await readFile(join(entryDir, TRASH_INFO), 'utf8').catch(() => null);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as TrashInfo;
    if (typeof parsed.originalPath === 'string' && typeof parsed.deletedAt === 'string') {
      return parsed;
    }
  } catch {
    // corrotto
  }
  return null;
}
