import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { schema } from './schema';

export type Db = ReturnType<typeof createDb>;

export function createDb(path: string) {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  // Con WAL + worker che scrive mentre la UI legge, una scrittura concorrente puo' incrociare un
  // lock: attendi fino a 5s invece di fallire subito con SQLITE_BUSY.
  sqlite.pragma('busy_timeout = 5000');
  // NORMAL e' il livello consigliato con WAL: durabilita' adeguata (nessuna perdita per crash
  // dell'app, solo per crash dell'OS sull'ultimo commit) con molti meno fsync di FULL.
  sqlite.pragma('synchronous = NORMAL');
  return drizzle(sqlite, { schema });
}

export function runMigrations(db: Db, migrationsFolder: string): void {
  migrate(db, { migrationsFolder });
}

export { schema };
