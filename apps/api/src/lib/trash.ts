import { randomUUID } from 'node:crypto';
import { lstat, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { atomicMove, ensureDir } from './download-fs';
import type { Logger } from './logger';
import { canonicalPath, canonicalRootFor, pathIsInside } from './path-containment';

/**
 * Cestino condiviso (soft-delete) usato sia dal Gestore file sia dalla Libreria.
 *
 * Ogni root di download ha una cartella `.trash/` (inizia con '.', quindi già esclusa dal listing).
 * Una voce cestino è una sottocartella `<timestamp>_<hex>` che contiene l'elemento spostato più un
 * `.trashinfo.json` con i metadati per il ripristino. Il pattern `TRASH_ID` vincola gli input di
 * restore (niente path traversal).
 */

export const TRASH_DIR = '.trash';
export const TRASH_INFO = '.trashinfo.json';
export const TRASH_ID = /^\d+_[a-f0-9]+$/;

export interface TrashInfo {
  originalPath: string;
  name: string;
  deletedAt: string;
  type: 'dir' | 'file';
}

export interface MoveToTrashOperations {
  ensureDir(path: string, logger?: Logger): Promise<void>;
  atomicMove(from: string, to: string, logger?: Logger): Promise<void>;
  writeInfo(path: string, contents: string): Promise<void>;
  removeEntry(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

const DEFAULT_MOVE_OPERATIONS: MoveToTrashOperations = {
  ensureDir,
  atomicMove,
  writeInfo: async (path, contents) => {
    await writeFile(path, contents, 'utf8');
  },
  removeEntry: async (path) => {
    await rm(path, { recursive: true, force: true });
  },
  exists: async (path) =>
    stat(path)
      .then(() => true)
      .catch(() => false),
};

/**
 * Path canonico del namespace `.trash`, solo se è una directory reale e diretta della root.
 * Symlink/junction vengono rifiutati anche quando puntano a un'altra posizione interna: empty/prune
 * non devono mai acquisire implicitamente autorità su un namespace diverso.
 */
export async function canonicalTrashRoot(root: string): Promise<string | null> {
  const absoluteRoot = resolve(root);
  const canonicalRoot = await canonicalPath(absoluteRoot);
  if (!canonicalRoot) {
    return null;
  }
  const requestedTrashRoot = join(absoluteRoot, TRASH_DIR);
  const info = await lstat(requestedTrashRoot).catch(() => null);
  if (!info?.isDirectory() || info.isSymbolicLink()) {
    return null;
  }
  const trashRoot = await canonicalPath(requestedTrashRoot);
  if (!trashRoot || relative(canonicalRoot, trashRoot) !== TRASH_DIR) {
    return null;
  }
  return trashRoot;
}

/** Path canonico di una voce esistente, confinata direttamente nel namespace del cestino. */
export async function canonicalTrashEntry(trashRoot: string, id: string): Promise<string | null> {
  if (!TRASH_ID.test(id)) {
    return null;
  }
  const requested = join(trashRoot, id);
  const info = await lstat(requested).catch(() => null);
  if (!info?.isDirectory() || info.isSymbolicLink()) {
    return null;
  }
  const entry = await canonicalPath(requested);
  return entry && relative(trashRoot, entry) === id ? entry : null;
}

/** Sposta `target` nel cestino della sua `root`, scrivendo i metadati per il ripristino. */
export async function moveToTrash(
  target: string,
  root: string,
  isDir: boolean,
  logger?: Logger,
  operationOverrides: Partial<MoveToTrashOperations> = {},
): Promise<void> {
  const operations = { ...DEFAULT_MOVE_OPERATIONS, ...operationOverrides };
  const targetInfo = await lstat(target).catch(() => null);
  if (!targetInfo) {
    throw new Error('Elemento da cestinare non trovato.');
  }
  // Spostare un link a directory cambia il contesto di risoluzione dei target relativi; una
  // junction/symlink valida all'origine può quindi diventare dangling dentro `.trash` e non essere
  // più elencabile o ripristinabile. Non promettiamo recoverability falsa: falliamo prima di creare
  // metadata o spostare alcunché. I file symlink sono già esclusi dai caller file-only.
  if (isDir && targetInfo.isSymbolicLink()) {
    throw new Error('Le cartelle symlink o junction non possono essere spostate nel cestino.');
  }
  const containedRoot = await canonicalRootFor(target, [root]);
  if (!containedRoot) {
    throw new Error('Elemento fuori dalla root configurata o containment non verificabile.');
  }

  const requestedTrashRoot = join(containedRoot, TRASH_DIR);
  await operations.ensureDir(requestedTrashRoot, logger);
  const trashRoot = await canonicalTrashRoot(containedRoot);
  if (!trashRoot) {
    throw new Error('Namespace del cestino non confinato nella root configurata.');
  }

  const id = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  const requestedEntryDir = join(trashRoot, id);
  await operations.ensureDir(requestedEntryDir, logger);
  const entryDir = await canonicalTrashEntry(trashRoot, id);
  if (!entryDir) {
    throw new Error('Voce del cestino non confinata nel relativo namespace.');
  }

  const originalPath = resolve(target);
  const name = basename(originalPath);
  const moved = join(entryDir, name);
  const infoPath = join(entryDir, TRASH_INFO);
  const info: TrashInfo = {
    originalPath,
    name,
    deletedAt: new Date().toISOString(),
    type: isDir ? 'dir' : 'file',
  };

  try {
    // Il metadata viene preparato prima del move: una failure di scrittura lascia l'originale
    // intatto e impedisce di creare una voce non ripristinabile.
    await operations.writeInfo(infoPath, JSON.stringify(info));
  } catch (error) {
    await operations.removeEntry(entryDir).catch((cleanupError) => {
      logger?.error({ err: cleanupError, entryDir }, 'Pulizia voce cestino incompleta fallita');
    });
    throw error;
  }

  try {
    await operations.atomicMove(target, moved, logger);
  } catch (moveError) {
    let targetExists = await operations.exists(target);
    const movedExists = await operations.exists(moved);

    // `rename` è atomico, ma questa compensazione protegge anche implementazioni o filesystem che
    // dovessero segnalare errore dopo aver già spostato l'elemento.
    if (!targetExists && movedExists) {
      try {
        await operations.atomicMove(moved, target, logger);
        targetExists = true;
      } catch (rollbackError) {
        logger?.error(
          { err: rollbackError, target, moved },
          'Rollback dello spostamento nel cestino fallito',
        );
        // La voce resta completa di metadata e payload, quindi è ancora recuperabile manualmente.
        throw new AggregateError(
          [moveError, rollbackError],
          'Spostamento nel cestino e relativo rollback falliti.',
        );
      }
    }

    if (targetExists) {
      await operations.removeEntry(entryDir).catch((cleanupError) => {
        logger?.error({ err: cleanupError, entryDir }, 'Pulizia voce cestino fallita');
      });
    }
    throw moveError;
  }
}

/** Legge e valida i metadati di una voce cestino, o null se assenti/corrotti. */
export async function readTrashInfo(entryDir: string): Promise<TrashInfo | null> {
  const raw = await readFile(join(entryDir, TRASH_INFO), 'utf8').catch(() => null);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<TrashInfo>;
    if (
      typeof parsed.originalPath !== 'string' ||
      !isAbsolute(parsed.originalPath) ||
      typeof parsed.name !== 'string' ||
      parsed.name.length === 0 ||
      parsed.name === '.' ||
      parsed.name === '..' ||
      basename(parsed.name) !== parsed.name ||
      basename(parsed.originalPath) !== parsed.name ||
      typeof parsed.deletedAt !== 'string' ||
      !Number.isFinite(Date.parse(parsed.deletedAt)) ||
      (parsed.type !== 'dir' && parsed.type !== 'file')
    ) {
      return null;
    }
    return parsed as TrashInfo;
  } catch {
    return null;
  }
}
