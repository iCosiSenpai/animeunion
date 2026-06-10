import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pino } from 'pino';
import { type Db, createDb, runMigrations } from '../db';

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

export function createTestDb(): Db {
  const db = createDb(':memory:');
  runMigrations(db, migrationsFolder);
  return db;
}

export const testLogger = pino({ level: 'silent' });
