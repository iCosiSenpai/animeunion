import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Env, env } from './config/env';
import { createDb, runMigrations } from './db';
import { createDownloadWorker } from './lib/download-worker';
import { logger } from './lib/logger';
import { createAuthService } from './services/auth-service';
import { createCatalogService } from './services/catalog-service';
import { createConfigService } from './services/config-service';
import { createDownloadService } from './services/download-service';
import { createFavoritesService } from './services/favorites-service';
import { createFollowService } from './services/follow-service';
import { createHomeService } from './services/home-service';
import { createLibraryService } from './services/library-service';
import { createProfileService } from './services/profile-service';
import { createRenamerService } from './services/renamer-service';
import { createSeriesResolver } from './services/series-resolver';
import { createSource } from './sources';
import type { Context } from './trpc';

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle');

export function createAppContext(options: { env?: Env; databasePath?: string } = {}): Context {
  const resolvedEnv = options.env ?? env;
  const db = createDb(options.databasePath ?? resolvedEnv.DATABASE_PATH);
  runMigrations(db, migrationsFolder);
  const auth = createAuthService({
    db,
    baseUrl: resolvedEnv.ANIMEUNION_API_URL,
    email: resolvedEnv.ANIMEUNION_EMAIL,
    password: resolvedEnv.ANIMEUNION_PASSWORD,
    logger,
    rateLimitMs: resolvedEnv.RATE_LIMIT_MS,
  });
  const source = createSource({
    env: resolvedEnv,
    getToken: () => auth.getToken(),
    onAuthError: () => auth.invalidateAndRelogin(),
  });
  const config = createConfigService({ db });
  const catalog = createCatalogService({ db, source, config, logger });
  const follow = createFollowService({ db, source, logger });
  const favorites = createFavoritesService({ db, source, catalog, config, logger });
  const profile = createProfileService({ source, logger });
  const home = createHomeService({ source, logger });
  const renamer = createRenamerService({ db });
  const resolver = createSeriesResolver({ db });
  const library = createLibraryService({ db, config, renamer, resolver, logger });
  const worker = createDownloadWorker({ db, catalog, config, logger, renamer });
  const download = createDownloadService({ db, worker, catalog, config, logger });
  return {
    db,
    source,
    services: { catalog, follow, favorites, profile, home, config, auth, download, library },
    logger,
  };
}
