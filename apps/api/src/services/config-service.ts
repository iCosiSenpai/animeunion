import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { type AppConfig, type ConfigKey, type Language, appConfigSchema } from '@animeunion/shared';
import type { Db } from '../db';
import { schema } from '../db';

export type DownloadDirKey = 'seriesPathSub' | 'seriesPathDub' | 'moviePathSub' | 'moviePathDub';

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
  /** Tutte le cartelle radice distinte effettivamente in uso (per scan/sweep). */
  distinctDownloadRoots(): string[];
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

export function createConfigService(deps: { db: Db }): ConfigService {
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
    return appConfigSchema.parse(raw);
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

  return {
    getAll,

    get<K extends ConfigKey>(key: K): AppConfig[K] {
      return getAll()[key];
    },

    set<K extends ConfigKey>(key: K, value: unknown): AppConfig[K] {
      const parsed = appConfigSchema.shape[key].parse(value) as AppConfig[K];
      const serialized = JSON.stringify(parsed);
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
    distinctDownloadRoots,

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
      // Punto di partenza: il path richiesto, altrimenti il mount media tipico, poi /data.
      const candidates = [path?.trim(), '/media', '/data', resolve('.')].filter(
        (p): p is string => !!p,
      );
      let target = resolve('.');
      for (const c of candidates) {
        const abs = resolve(c);
        if (await isDir(abs)) {
          target = abs;
          break;
        }
      }
      const entries = await readdir(target, { withFileTypes: true }).catch(() => []);
      const dirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, 'it'));
      const parent = dirname(target) !== target ? dirname(target) : null;
      return { path: target, parent, dirs };
    },
  };
}
