import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type AppConfig, type ConfigKey, appConfigSchema } from '@animeunion/shared';
import type { Db } from '../db';
import { schema } from '../db';

export interface AnimePathStatus {
  path: string;
  exists: boolean;
  writable: boolean;
  isDefault: boolean;
}

export interface ConfigService {
  getAll(): AppConfig;
  get<K extends ConfigKey>(key: K): AppConfig[K];
  set<K extends ConfigKey>(key: K, value: unknown): AppConfig[K];
  /** Verifica che la cartella di download esista e sia scrivibile. */
  animePathStatus(): Promise<AnimePathStatus>;
}

const DEFAULT_ANIME_PATH = appConfigSchema.shape.animePath.parse(undefined);

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

    async animePathStatus(): Promise<AnimePathStatus> {
      const path = getAll().animePath;
      const isDefault = path === DEFAULT_ANIME_PATH;
      try {
        await mkdir(path, { recursive: true });
        const probe = join(path, `.write-test-${Date.now()}`);
        await writeFile(probe, 'ok');
        await rm(probe).catch(() => {});
        return { path, exists: true, writable: true, isDefault };
      } catch {
        let exists = false;
        try {
          exists = (await stat(path)).isDirectory();
        } catch {
          exists = false;
        }
        return { path, exists, writable: false, isDefault };
      }
    },
  };
}
