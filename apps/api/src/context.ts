import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Env, env } from './config/env';
import { createDb, runMigrations } from './db';
import { logger } from './lib/logger';
import { createAuthService } from './services/auth-service';
import { createCatalogService } from './services/catalog-service';
import { createConfigService } from './services/config-service';
import { createFollowService } from './services/follow-service';
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
  const follow = createFollowService({ db });
  return {
    db,
    source,
    services: { catalog, follow, config, auth },
    logger,
  };
}
