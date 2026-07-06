import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import {
  type AppConfig,
  type ConfigKey,
  type Language,
  SECRET_CONFIG_KEYS,
  appConfigSchema,
} from '@animeunion/shared';
import type { Db } from '../db';
import { schema } from '../db';
import { decryptSecret, encryptSecret } from '../lib/crypto';

export type DownloadDirKey = 'seriesPathSub' | 'seriesPathDub' | 'moviePathSub' | 'moviePathDub';

/** Le 4 chiavi di config che rappresentano cartelle di download (per rilevarne il cambio). */
export const DOWNLOAD_DIR_KEYS: DownloadDirKey[] = [
  'seriesPathSub',
  'seriesPathDub',
  'moviePathSub',
  'moviePathDub',
];

export interface DownloadDirStatus {
  key: DownloadDirKey;
  label: string;
  /** Percorso effettivo usato (dopo i fallback). */
  path: string;
  /** L'utente l'ha impostato esplicitamente (false = eredita da un'altra cartella). */
  configured: boolean;
  exists: boolean;
  writable: boolean;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  dirs: string[];
}

export interface ConfigService {
  getAll(): AppConfig;
  get<K extends ConfigKey>(key: K): AppConfig[K];
  set<K extends ConfigKey>(key: K, value: unknown): AppConfig[K];
  /** Cartella di destinazione per (film? × lingua), con i fallback. */
  resolveDownloadRoot(isMovie: boolean, language: Language): string;
  /** True se l'utente ha impostato almeno la cartella base (Serie · SUB ITA). */
  isConfigured(): boolean;
  /** Tutte le cartelle radice distinte effettivamente in uso (per scan/sweep). */
  distinctDownloadRoots(): string[];
  /** Quanti episode_file scaricati hanno il `localPath` sotto la cartella `root` indicata. */
  countDownloadsUnder(root: string): number;
  /** Stato (esistenza/scrivibilità) delle 4 cartelle configurabili. */
  downloadDirsStatus(): Promise<DownloadDirStatus[]>;
  /** Elenca le sottocartelle di `path` (browser cartelle delle Impostazioni). */
  browseDir(path?: string): Promise<BrowseResult>;
}

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isWritable(path: string): Promise<boolean> {
  try {
    await mkdir(path, { recursive: true });
    const probe = join(path, `.write-test-${Date.now()}`);
    await writeFile(probe, 'ok');
    await rm(probe).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export function createConfigService(deps: { db: Db; encryptKey?: string }): ConfigService {
  const secretKeys = SECRET_CONFIG_KEYS as readonly string[];

  function getAll(): AppConfig {
    const rows = deps.db.select().from(schema.config).all();
    const raw: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        raw[row.key] = JSON.parse(row.value);
      } catch {
        // valore corrotto: lascia il default del contratto
      }
    }
    const config = appConfigSchema.parse(raw);
    // Decifra i segreti salvati cifrati (transparente sui valori legacy in chiaro). Il FE riceve
    // comunque la maschera: la decifratura serve solo alle letture interne (notifier, Jellyfin).
    if (deps.encryptKey) {
      for (const key of SECRET_CONFIG_KEYS) {
        const value = config[key];
        if (typeof value === 'string' && value) {
          (config[key] as string) = decryptSecret(value, deps.encryptKey);
        }
      }
    }
    return config;
  }

  /** Percorsi risolti per le 4 categorie (con fallback a cascata). */
  function roots() {
    const c = getAll();
    const seriesSub = c.seriesPathSub;
    const seriesDub = c.seriesPathDub || seriesSub;
    const movieSub = c.moviePathSub || seriesSub;
    const movieDub = c.moviePathDub || movieSub || seriesDub;
    return { seriesSub, seriesDub, movieSub, movieDub };
  }

  function resolveDownloadRoot(isMovie: boolean, language: Language): string {
    const r = roots();
    const dub = language === 'DUB_ITA';
    if (isMovie) {
      return dub ? r.movieDub : r.movieSub;
    }
    return dub ? r.seriesDub : r.seriesSub;
  }

  function distinctDownloadRoots(): string[] {
    const r = roots();
    return [...new Set([r.seriesSub, r.seriesDub, r.movieSub, r.movieDub])].filter(Boolean);
  }

  function isConfigured(): boolean {
    return getAll().seriesPathSub.trim() !== '';
  }

  return {
    getAll,

    get<K extends ConfigKey>(key: K): AppConfig[K] {
      return getAll()[key];
    },

    set<K extends ConfigKey>(key: K, value: unknown): AppConfig[K] {
      const parsed = appConfigSchema.shape[key].parse(value) as AppConfig[K];
      // Cifra a riposo i segreti (Telegram/Jellyfin) se c'e' la chiave: cosi' non finiscono in chiaro
      // nel DB e nei backup. Restituisce comunque il valore in chiaro al chiamante.
      const toStore =
        deps.encryptKey && secretKeys.includes(key) && typeof parsed === 'string' && parsed
          ? encryptSecret(parsed, deps.encryptKey)
          : parsed;
      const serialized = JSON.stringify(toStore);
      const timestamp = new Date().toISOString();
      deps.db
        .insert(schema.config)
        .values({ key, value: serialized, updatedAt: timestamp })
        .onConflictDoUpdate({
          target: schema.config.key,
          set: { value: serialized, updatedAt: timestamp },
        })
        .run();
      return parsed;
    },

    resolveDownloadRoot,
    isConfigured,
    distinctDownloadRoots,

    countDownloadsUnder(root: string): number {
      const target = resolve(root);
      if (target === '' || root.trim() === '') {
        return 0;
      }
      const rows = deps.db
        .select({ localPath: schema.episodeFile.localPath })
        .from(schema.episodeFile)
        .all();
      let n = 0;
      for (const row of rows) {
        if (!row.localPath) {
          continue;
        }
        const local = resolve(row.localPath);
        if (local === target || local.startsWith(target + sep)) {
          n += 1;
        }
      }
      return n;
    },

    async downloadDirsStatus(): Promise<DownloadDirStatus[]> {
      const c = getAll();
      const r = roots();
      const items: Array<{
        key: DownloadDirKey;
        label: string;
        path: string;
        configured: boolean;
      }> = [
        {
          key: 'seriesPathSub',
          label: 'Serie · SUB ITA',
          path: r.seriesSub,
          configured: c.seriesPathSub !== '',
        },
        {
          key: 'seriesPathDub',
          label: 'Serie · DUB ITA',
          path: r.seriesDub,
          configured: c.seriesPathDub !== '',
        },
        {
          key: 'moviePathSub',
          label: 'Film · SUB ITA',
          path: r.movieSub,
          configured: c.moviePathSub !== '',
        },
        {
          key: 'moviePathDub',
          label: 'Film · DUB ITA',
          path: r.movieDub,
          configured: c.moviePathDub !== '',
        },
      ];
      return Promise.all(
        items.map(async (it) => ({
          ...it,
          exists: await isDir(it.path),
          writable: await isWritable(it.path),
        })),
      );
    },

    async browseDir(path?: string): Promise<BrowseResult> {
      // Confinamento (B6): il folder picker puo' navigare solo dentro i mount previsti (/media,
      // /data) e le cartelle di download gia' configurate. Prima si poteva risalire fino a / e
      // listare qualunque cartella: browseDir diventava una primitiva di enumerazione del filesystem
      // (raggiungibile solo passando il lock, ma comunque da confinare).
      const rawRoots = ['/media', '/data', ...distinctDownloadRoots()]
        .filter(Boolean)
        .map((p) => resolve(p));
      const allowedRoots: string[] = [];
      for (const r of [...new Set(rawRoots)]) {
        if (await isDir(r)) {
          allowedRoots.push(r);
        }
      }
      // Nessun mount previsto (es. ambiente di sviluppo): ripiega sulla cwd.
      if (allowedRoots.length === 0) {
        allowedRoots.push(resolve('.'));
      }
      const containingRoot = (t: string): string | null =>
        allowedRoots.find((r) => t === r || t.startsWith(r + sep)) ?? null;

      let target = allowedRoots[0] as string;
      const requested = path?.trim();
      if (requested) {
        const abs = resolve(requested);
        // Solo se il path richiesto e' dentro una radice consentita ed e' una cartella reale.
        if (containingRoot(abs) && (await isDir(abs))) {
          target = abs;
        }
      }
      const entries = await readdir(target, { withFileTypes: true }).catch(() => []);
      const dirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, 'it'));
      // Il parent e' navigabile solo se resta dentro una radice consentita: niente risalita oltre i mount.
      const parentDir = dirname(target);
      const parent = parentDir !== target && containingRoot(parentDir) ? parentDir : null;
      return { path: target, parent, dirs };
    },
  };
}
