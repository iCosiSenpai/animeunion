import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { createDb, runMigrations } from './index';

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');
const dbPath = env.DATABASE_PATH;

const db = createDb(dbPath);
runMigrations(db, migrationsFolder);
logger.info({ dbPath }, 'Migrazioni applicate');
