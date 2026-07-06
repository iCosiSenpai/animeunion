import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { readFile, readdir, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type {
  FileEntry,
  FileLinkExternalResult,
  FileList,
  FileOpResult,
  Language,
  TrashEntry,
  TrashList,
} from '@animeunion/shared';
import { and, eq, gte, inArray, lt, or } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import { atomicMove, deleteFileAndPrune, ensureDir } from '../lib/download-fs';
import { listEpisodeFilesInDir } from '../lib/episode-file-match';
import { NotFoundError, PreconditionError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import type { ConfigService } from './config-service';
import type { RenamerService } from './renamer-service';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm']);

// Cartella cestino dentro ogni root configurata. Inizia con '.' → già esclusa dal `list`.
const TRASH_DIR = '.trash';
const TRASH_INFO = '.trashinfo.json';
// Id voce cestino sicuro: `<timestamp>_<hex>`. Vincola l'input di restore (no path traversal).
const TRASH_ID = /^\d+_[a-f0-9]+$/;

interface TrashInfo {
  originalPath: string;
  name: string;
  deletedAt: string;
  type: 'dir' | 'file';
}

function isVideo(name: string): boolean {
  const dot = name.lastIndexOf('.');
  return dot >= 0 && VIDEO_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

// Contenuto vero alla Jellyfin: le cartelle di livello "stagione" che contengono episodi da
// collegare (Season NN, Specials, OVA/ONA, Movie/Film). Tutto il resto a quel livello (backdrops,
// theme-music, trailer, cartelle arbitrarie...) e' "extra": va mostrato ma non segnalato come
// orfano o "non importato".
function isContentFolderName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return (
    /^(season|stagione)\s*\d+$/.test(n) || // Season NN, Stagione NN, Season 00/0
    /^specials?$/.test(n) || // Special, Specials
    /^(ova|ona)s?(\s*\d+)?$/.test(n) || // OVA, OVAs, ONA, OVA 1
    /^(movie|film)s?$/.test(n) // Movie(s), Film(s)
  );
}

// Cartelle "extra" alla Jellyfin (sigle/artwork/trailer/scene...): non contengono episodi da
// collegare. Riconosciute per nome a QUALUNQUE profondita' (anche dentro una Season), cosi'
// Season 01/backdrops o Specials/themes risultano extra come backdrops a livello serie.
const EXTRA_FOLDER_NAMES = new Set([
  'backdrops',
  'theme-music',
  'theme-songs',
  'themes',
  'trailers',
  'featurettes',
  'behind the scenes',
  'deleted scenes',
  'interviews',
  'scenes',
  'samples',
  'shorts',
  'clips',
  'extras',
  'extra',
  'other',
  'others',
]);
function isExtraFolderName(name: string): boolean {
  return EXTRA_FOLDER_NAMES.has(name.trim().toLowerCase());
}

/** Vero se esiste già qualcosa (file o cartella) al percorso `p`. */
async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// Nomi file/cartella sicuri: niente separatori di percorso né caratteri illegali su NTFS.
const ILLEGAL_NAME = /[/\\:*?"<>|]/;

// Filtro SQL per le righe episode_file il cui localPath è `dir` o sta sotto `dir`, senza caricare
// l'intera tabella su librerie giganti (One Piece). Range half-open su collation BINARY: i path
// salvati sono canonici (join delle root configurate), il bound '\u{10FFFF}' è > di qualunque char
// valido → sovrainsieme sicuro; il confronto JS `resolve()` resta la garanzia esatta a valle.
function trackedUnder(dir: string) {
  const prefix = dir + sep;
  return or(
    eq(schema.episodeFile.localPath, dir),
    and(
      gte(schema.episodeFile.localPath, prefix),
      lt(schema.episodeFile.localPath, `${prefix}\u{10FFFF}`),
    ),
  );
}

/**
 * Ricava il numero episodio dal nome file per il collegamento "senza scaricare" (Step 13). Prova,
 * in ordine di affidabilità: SxxExx, marcatori espliciti (Ep/Episodio/Episode/E + numero), il
 * separatore a trattino tipico dei fansub ("- 12"), infine un unico numero isolato che non sia una
 * risoluzione/codec/anno. Ritorna null se non riconosce nulla di certo.
 */
export function parseEpisodeNumber(fileName: string): number | null {
  const base = fileName.replace(/\.[^.]+$/, '');
  // 1) SxxExx (S01E12, s1e5)
  const se = base.match(/s\d{1,3}\s*e\s*(\d{1,4})/i);
  if (se?.[1]) {
    return Number(se[1]);
  }
  // 2) Marcatori espliciti: Ep / Episodio / Episode / E / # + numero
  const ep = base.match(/(?:\bepisodio|\bepisode|\bep|#)\.?\s*[._-]?\s*0*(\d{1,4})\b/i);
  if (ep?.[1]) {
    return Number(ep[1]);
  }
  // 3) Separatore a trattino dei fansub: "Titolo - 12" (eventuale "v2" di revisione)
  const dash = base.match(/[-–]\s*0*(\d{1,4})(?:v\d)?(?=$|[\s_.\][-])/);
  if (dash?.[1]) {
    return Number(dash[1]);
  }
  // 4) Fallback: un solo numero isolato, scartati risoluzioni/codec/anni/bit-depth.
  const cleaned = base
    .replace(/\b\d{3,4}p\b/gi, ' ')
    .replace(/\bx?\s?26[45]\b/gi, ' ')
    .replace(/\bh\.?26[45]\b/gi, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\b\d+\s*bit\b/gi, ' ');
  const nums = cleaned.match(/\d{1,4}/g);
  if (nums?.length === 1 && nums[0]) {
    return Number(nums[0]);
  }
  return null;
}

export interface DuplicateFile {
  path: string;
  size: number;
}

export interface DuplicateGroup {
  animeId: string;
  animeTitle: string;
  episodeNumber: number;
  language: Language;
  /** Il file che viene tenuto (collegato nel DB o canonico). */
  keep: string;
  /** I file doppioni proposti per lo spostamento nel cestino. */
  duplicates: DuplicateFile[];
}

export interface DuplicateReport {
  groups: DuplicateGroup[];
  totalDuplicates: number;
  totalBytes: number;
}

export interface FileManagerService {
  list(path?: string): Promise<FileList>;
  rename(path: string, newName: string): Promise<FileOpResult>;
  move(path: string, destDir: string): Promise<FileOpResult>;
  remove(path: string): Promise<FileOpResult>;
  /** Trova i file doppioni (stesso episodio, naming diverso) gia' presenti nella libreria. */
  findDuplicates(): Promise<DuplicateReport>;
  /** Sposta nel cestino i file indicati (duplicati confermati dall'utente). */
  dedupeMove(paths: string[]): Promise<{ moved: number; failed: number }>;
  mkdir(parent: string, name: string): Promise<FileOpResult>;
  relink(path: string, episodeFileId: string): Promise<FileOpResult>;
  /**
   * Collega "senza scaricare" i file video diretti di `path` agli episodi di un anime: ricava il
   * numero episodio dal nome file e marca i corrispondenti `episode_file` come `external` (senza
   * spostarli). Non passa dal downloader.
   */
  linkExternalFolder(
    path: string,
    animeId: string,
    language: Language,
  ): Promise<FileLinkExternalResult>;
  /** Rinomina/sposta i file tracciati sotto `path` secondo lo schema del renamer. */
  renameToScheme(path: string): Promise<FileOpResult>;
  /** Rimuove ricorsivamente le cartelle vuote sotto `path`. */
  pruneEmpty(path: string): Promise<FileOpResult>;
  /** Elenca le voci del cestino (file/cartelle eliminati ma recuperabili). */
  trashList(): Promise<TrashList>;
  /** Ripristina una voce del cestino al suo percorso originale. */
  trashRestore(id: string): Promise<FileOpResult>;
  /** Svuota il cestino (eliminazione definitiva di tutte le voci). */
  trashEmpty(): Promise<FileOpResult>;
  /** Elimina definitivamente le voci del cestino più vecchie di `retentionDays`. */
  pruneTrash(retentionDays: number): Promise<number>;
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

  // Una entry e' "extra" se un qualsiasi segmento-cartella sotto la cartella-serie e' un nome extra
  // noto (backdrops, theme-music...) A QUALUNQUE profondita', oppure (regola storica) la cartella di
  // livello stagione (segs[1]) non e' contenuto. Le cartelle-serie (livello 1) e i file sciolti a
  // livello 2 NON sono extra: restano collegabili.
  function isExtraEntry(full: string, isDir: boolean): boolean {
    const root = rootOf(full);
    if (!root) {
      return false;
    }
    const segs = relative(root, resolve(full)).split(sep).filter(Boolean);
    const minDepth = isDir ? 2 : 3;
    if (segs.length < minDepth || segs[1] == null) {
      return false;
    }
    // Segmenti-cartella sotto la serie (segs[0]): per una cartella includono il proprio nome, per un
    // file escludono il nome del file.
    const folderSegs = isDir ? segs.slice(1) : segs.slice(1, -1);
    return folderSegs.some(isExtraFolderName) || !isContentFolderName(segs[1]);
  }

  /** Aggiorna episode_file quando un file/cartella tracciato viene rinominato o spostato. */
  function syncMovedPaths(oldAbs: string, newAbs: string): void {
    // Read + update in un'unica transazione: evita che un download concorrente, accodato tra la
    // SELECT e le UPDATE, sfugga (o venga toccato per errore).
    db.transaction((tx) => {
      const rows = tx
        .select({ id: schema.episodeFile.id, localPath: schema.episodeFile.localPath })
        .from(schema.episodeFile)
        .where(trackedUnder(oldAbs))
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
          tx.update(schema.episodeFile)
            .set({ localPath: nextPath, updatedAt: ts })
            .where(eq(schema.episodeFile.id, row.id))
            .run();
        }
      }
    });
  }

  /** Azzera lo stato di download dei file tracciati eliminati. */
  function syncDeletedPaths(removedAbs: string): void {
    db.transaction((tx) => {
      const rows = tx
        .select({ id: schema.episodeFile.id, localPath: schema.episodeFile.localPath })
        .from(schema.episodeFile)
        .where(trackedUnder(removedAbs))
        .all();
      const prefix = removedAbs + sep;
      const ts = new Date().toISOString();
      for (const row of rows) {
        if (!row.localPath) {
          continue;
        }
        const local = resolve(row.localPath);
        if (local === removedAbs || local.startsWith(prefix)) {
          tx.update(schema.episodeFile)
            .set({
              downloadStatus: 'not_downloaded',
              localPath: null,
              fileSize: null,
              updatedAt: ts,
            })
            .where(eq(schema.episodeFile.id, row.id))
            .run();
        }
      }
    });
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
          content: false,
          // Le radici configurate sono per definizione cartelle dell'app.
          managed: true,
        });
      }
    }
    return { path: '', parent: null, atRoot: false, entries };
  }

  /** Sposta `target` nel cestino della sua root, scrivendo i metadati per il ripristino. */
  async function moveToTrash(target: string, root: string, isDir: boolean): Promise<void> {
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
  async function readTrashInfo(entryDir: string): Promise<TrashInfo | null> {
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

  function safeSize(p: string): number {
    try {
      return statSync(p).size;
    } catch {
      return 0;
    }
  }

  // Corpo condiviso di `remove` (usato anche da `dedupeMove`): confina, protegge i file esterni,
  // sposta nel cestino (se abilitato) e sincronizza il DB.
  async function removePath(path: string): Promise<FileOpResult> {
    const target = assertInside(path);
    if (isRoot(target)) {
      throw new PreconditionError('Non puoi eliminare una cartella radice.');
    }
    // Salvaguardia anti-perdita-dati: mai cancellare file collegati come esterni (di proprietà
    // dell'utente, scaricati fuori app). Vanno prima scollegati ("Scollega esterno").
    const externalUnder = db
      .select({ localPath: schema.episodeFile.localPath })
      .from(schema.episodeFile)
      .where(and(eq(schema.episodeFile.downloadStatus, 'external'), trackedUnder(target)))
      .all()
      .filter((r) => {
        if (!r.localPath) {
          return false;
        }
        const lp = resolve(r.localPath);
        return lp === target || lp.startsWith(target + sep);
      });
    if (externalUnder.length > 0) {
      throw new PreconditionError(
        `La cartella contiene ${externalUnder.length} file collegati come esterni: scollegali (Scollega esterno) prima di eliminarla.`,
      );
    }
    const root = rootOf(target);
    let isDir = false;
    try {
      isDir = (await stat(target)).isDirectory();
    } catch {
      isDir = false;
    }
    // Cestino (soft-delete): sposta in `.trash` invece di cancellare subito, così è recuperabile.
    if (config.get('trashEnabled') && root) {
      await moveToTrash(target, root, isDir);
      syncDeletedPaths(target);
      return { ok: true };
    }
    if (isDir) {
      await rm(target, { recursive: true, force: true });
      syncDeletedPaths(target);
    } else if (root) {
      await deleteFileAndPrune(target, root, logger);
      syncDeletedPaths(target);
    }
    return { ok: true };
  }

  return {
    async list(path) {
      if (!path || path.trim() === '' || !rootOf(path)) {
        return listRoots();
      }
      const target = assertInside(path);
      const dirents = await readdir(target, { withFileTypes: true }).catch(() => []);

      // Mappa localPath -> episodeFileId per marcare i file tracciati/orfani. Solo i file del
      // sotto-albero corrente: su una libreria gigante non si carica l'intera episode_file.
      const tracked = new Map<string, string>();
      for (const row of db
        .select({ id: schema.episodeFile.id, localPath: schema.episodeFile.localPath })
        .from(schema.episodeFile)
        .where(trackedUnder(target))
        .all()) {
        if (row.localPath) {
          tracked.set(resolve(row.localPath), row.id);
        }
      }
      // Array ordinato: la verifica "managed" (esiste un file tracciato sotto la cartella) si fa in
      // O(log n) con una ricerca binaria del primo path >= prefisso, invece di O(n) per ogni dirent.
      const sortedTracked = [...tracked.keys()].sort();
      const isManagedDir = (full: string): boolean => {
        const prefix = resolve(full) + sep;
        let lo = 0;
        let hi = sortedTracked.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if ((sortedTracked[mid] as string) < prefix) {
            lo = mid + 1;
          } else {
            hi = mid;
          }
        }
        return lo < sortedTracked.length && (sortedTracked[lo] as string).startsWith(prefix);
      };

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
            extra: isExtraEntry(full, true),
            content: isContentFolderName(d.name),
            managed: isManagedDir(full),
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
            extra: isExtraEntry(full, false),
            content: false,
            managed: false,
          });
        }
      }
      entries.sort((a, b) => {
        // Cartelle prima dei file.
        if (a.type !== b.type) {
          return a.type === 'dir' ? -1 : 1;
        }
        // Tra le cartelle: quelle NON importate (non scaricate dall'app) per prime.
        if (a.type === 'dir' && a.managed !== b.managed) {
          return a.managed ? 1 : -1;
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
      // Guardia anti-sovrascrittura: `fs.rename` clobbererebbe silenziosamente un elemento esistente.
      // (Coerente con `renameToScheme`, che già salta se la destinazione esiste.)
      if (dest !== target && (await pathExists(dest))) {
        throw new PreconditionError('Esiste già un elemento con questo nome nella cartella.');
      }
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
      // Guardia anti-sovrascrittura: non spostare sopra un elemento già presente alla destinazione.
      if (await pathExists(dest)) {
        throw new PreconditionError('La destinazione contiene già un elemento con questo nome.');
      }
      await atomicMove(target, dest, logger);
      syncMovedPaths(target, dest);
      return { ok: true, path: dest };
    },

    async remove(path) {
      return removePath(path);
    },

    findDuplicates() {
      // Ancora la ricerca agli episodi che il DB conosce come presenti: per ognuno cerca nella sua
      // cartella altri file che rappresentano lo STESSO (stagione, numero) con naming diverso. Cosi'
      // si segnalano solo veri doppioni (canonico + legacy), senza falsi positivi da parsing ingenuo.
      const rows = db
        .select({
          language: schema.episodeFile.language,
          localPath: schema.episodeFile.localPath,
          number: schema.episode.number,
          animeId: schema.anime.id,
          animeTitle: schema.anime.title,
        })
        .from(schema.episodeFile)
        .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
        .innerJoin(schema.anime, eq(schema.anime.id, schema.episode.animeId))
        .where(inArray(schema.episodeFile.downloadStatus, ['downloaded', 'external']))
        .all();

      const groups: DuplicateGroup[] = [];
      const seen = new Set<string>();
      for (const r of rows) {
        if (!r.localPath) {
          continue;
        }
        let canonical: string;
        try {
          canonical = renamer.computeEpisodePath({
            animeId: r.animeId,
            episodeNumber: r.number,
            language: r.language as Language,
          });
        } catch {
          continue;
        }
        const key = canonical.toLowerCase();
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const matches = [
          ...new Set(listEpisodeFilesInDir(canonical).map((p) => resolve(p))),
        ].filter((p) => existsSync(p));
        if (matches.length < 2) {
          continue;
        }
        const linked = resolve(r.localPath);
        const canonAbs = resolve(canonical);
        // Tieni il file collegato nel DB (o il canonico); scarta gli altri. Cosi' il DB resta
        // coerente e non serve ri-scaricare nulla.
        const keep = matches.includes(linked)
          ? linked
          : matches.includes(canonAbs)
            ? canonAbs
            : matches[0];
        const duplicates = matches
          .filter((p) => p !== keep)
          .map((p) => ({ path: p, size: safeSize(p) }));
        if (duplicates.length === 0) {
          continue;
        }
        groups.push({
          animeId: r.animeId,
          animeTitle: r.animeTitle,
          episodeNumber: r.number,
          language: r.language as Language,
          keep: keep ?? '',
          duplicates,
        });
      }
      const totalDuplicates = groups.reduce((n, g) => n + g.duplicates.length, 0);
      const totalBytes = groups.reduce(
        (n, g) => n + g.duplicates.reduce((s, d) => s + d.size, 0),
        0,
      );
      return Promise.resolve({ groups, totalDuplicates, totalBytes });
    },

    async dedupeMove(paths) {
      let moved = 0;
      let failed = 0;
      for (const p of paths) {
        try {
          await removePath(p);
          moved += 1;
        } catch (error) {
          logger.warn({ err: error, path: p }, 'dedupeMove: impossibile spostare il duplicato');
          failed += 1;
        }
      }
      return { moved, failed };
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

    async linkExternalFolder(path, animeId, language) {
      const target = assertInside(path);
      const dirents = await readdir(target, { withFileTypes: true }).catch(() => []);
      // episode_file dell'anime nella lingua scelta, indicizzati per numero episodio.
      const byNumber = new Map<number, { fileId: string; status: string }>();
      for (const row of db
        .select({
          fileId: schema.episodeFile.id,
          number: schema.episode.number,
          status: schema.episodeFile.downloadStatus,
        })
        .from(schema.episodeFile)
        .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
        .where(and(eq(schema.episode.animeId, animeId), eq(schema.episodeFile.language, language)))
        .all()) {
        byNumber.set(row.number, { fileId: row.fileId, status: row.status });
      }

      let linked = 0;
      let skipped = 0;
      let unmatched = 0;
      const ts = new Date().toISOString();
      for (const d of dirents) {
        // Solo i file video diretti (le stagioni sono cartelle a parte: niente ricorsione).
        if (!d.isFile() || !isVideo(d.name) || d.name.includes('.part.')) {
          continue;
        }
        const num = parseEpisodeNumber(d.name);
        if (num == null) {
          unmatched += 1;
          continue;
        }
        const match = byNumber.get(num);
        if (!match) {
          unmatched += 1;
          continue;
        }
        // Non scavalcare un episodio gia' scaricato dall'app.
        if (match.status === 'downloaded') {
          skipped += 1;
          continue;
        }
        const full = assertInside(join(target, d.name));
        let size: number | null = null;
        try {
          size = (await stat(full)).size;
        } catch {
          size = null;
        }
        db.update(schema.episodeFile)
          .set({
            downloadStatus: 'external',
            localPath: full,
            fileSize: size,
            downloadedAt: ts,
            updatedAt: ts,
          })
          .where(eq(schema.episodeFile.id, match.fileId))
          .run();
        linked += 1;
      }
      return { ok: true, linked, skipped, unmatched };
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

    async trashList(): Promise<TrashList> {
      const entries: TrashEntry[] = [];
      for (const root of roots()) {
        const trashRoot = join(root, TRASH_DIR);
        const dirents = await readdir(trashRoot, { withFileTypes: true }).catch(() => []);
        for (const d of dirents) {
          if (!d.isDirectory() || !TRASH_ID.test(d.name)) {
            continue;
          }
          const entryDir = join(trashRoot, d.name);
          const info = await readTrashInfo(entryDir);
          if (!info) {
            continue;
          }
          let size: number | null = null;
          if (info.type === 'file') {
            size = await stat(join(entryDir, info.name))
              .then((s) => s.size)
              .catch(() => null);
          }
          entries.push({
            id: d.name,
            name: info.name,
            originalPath: info.originalPath,
            deletedAt: info.deletedAt,
            type: info.type,
            size,
          });
        }
      }
      entries.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
      return { entries };
    },

    async trashRestore(id): Promise<FileOpResult> {
      if (!TRASH_ID.test(id)) {
        throw new PreconditionError('Id voce cestino non valido.');
      }
      for (const root of roots()) {
        const entryDir = join(root, TRASH_DIR, id);
        const info = await readTrashInfo(entryDir);
        if (!info) {
          continue;
        }
        const moved = join(entryDir, info.name);
        // Il percorso originale deve essere ancora dentro una root configurata.
        const dest = assertInside(info.originalPath);
        if (await pathExists(dest)) {
          throw new PreconditionError(
            'Esiste già un elemento al percorso originale: rinominalo o spostalo prima di ripristinare.',
          );
        }
        await atomicMove(moved, dest, logger);
        await rm(entryDir, { recursive: true, force: true }).catch(() => {});
        return { ok: true, path: dest };
      }
      throw new NotFoundError('Voce del cestino non trovata.');
    },

    async trashEmpty(): Promise<FileOpResult> {
      let count = 0;
      for (const root of roots()) {
        const trashRoot = join(root, TRASH_DIR);
        const dirents = await readdir(trashRoot, { withFileTypes: true }).catch(() => []);
        for (const d of dirents) {
          if (!d.isDirectory()) {
            continue;
          }
          await rm(join(trashRoot, d.name), { recursive: true, force: true }).catch(() => {});
          count += 1;
        }
      }
      return { ok: true, count };
    },

    async pruneTrash(retentionDays): Promise<number> {
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      let removed = 0;
      for (const root of roots()) {
        const trashRoot = join(root, TRASH_DIR);
        const dirents = await readdir(trashRoot, { withFileTypes: true }).catch(() => []);
        for (const d of dirents) {
          if (!d.isDirectory()) {
            continue;
          }
          const entryDir = join(trashRoot, d.name);
          const info = await readTrashInfo(entryDir);
          const deletedAtMs = info ? new Date(info.deletedAt).getTime() : 0;
          // Senza metadati validi o oltre la retention: elimina definitivamente.
          if (!info || Number.isNaN(deletedAtMs) || deletedAtMs < cutoff) {
            await rm(entryDir, { recursive: true, force: true }).catch(() => {});
            removed += 1;
          }
        }
      }
      return removed;
    },
  };
}
