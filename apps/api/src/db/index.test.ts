import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createDb } from './index';

describe('createDb pragmas', () => {
  it('imposta busy_timeout, synchronous=NORMAL, WAL e foreign_keys', () => {
    // Su un db su file: con `:memory:` journal_mode resta "memory" e synchronous non e' affidabile.
    const dir = mkdtempSync(join(tmpdir(), 'au-db-'));
    const dbPath = join(dir, 'pragmas.db');
    const db = createDb(dbPath);
    try {
      const busy = db.get<{ timeout: number }>(sql`PRAGMA busy_timeout`);
      expect(busy?.timeout).toBe(5000);

      // 1 = NORMAL (0 OFF, 1 NORMAL, 2 FULL, 3 EXTRA).
      const sync = db.get<{ synchronous: number }>(sql`PRAGMA synchronous`);
      expect(sync?.synchronous).toBe(1);

      const journal = db.get<{ journal_mode: string }>(sql`PRAGMA journal_mode`);
      expect(journal?.journal_mode).toBe('wal');

      const fk = db.get<{ foreign_keys: number }>(sql`PRAGMA foreign_keys`);
      expect(fk?.foreign_keys).toBe(1);
    } finally {
      // Chiude la connessione prima di rimuovere i file (su Windows un db aperto non si cancella).
      db.$client.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
