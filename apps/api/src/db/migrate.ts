import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../lib/logger';
import { createDb, runMigrations } from './index';

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');
const dbPath = process.env.DATABASE_PATH ?? './data/animeunion.db';

const db = createDb(dbPath);
runMigrations(db, migrationsFolder);
logger.info({ dbPath }, 'Migrazioni applicate');
