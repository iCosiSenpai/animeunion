import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { type Db, createDb, runMigrations, schema } from '../db';
import { testLogger } from '../test/helpers';
import { applyPendingRestore, createDbBackupService } from './db-backup-service';

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

let dir = '';
afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = '';
  }
});

function seed(db: Db, id: string): void {
  const ts = new Date().toISOString();
  db.insert(schema.anime)
    .values({
      id,
      slug: id,
      title: id,
      type: 'TV',
      status: 'ONGOING',
      episodeCount: 0,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
}

function setup() {
  dir = mkdtempSync(join(tmpdir(), 'au-bk-'));
  const dbPath = join(dir, 'app.db');
  const db = createDb(dbPath);
  runMigrations(db, migrationsFolder);
  seed(db, 'x1');
  const backupDir = join(dir, 'backups');
  const service = createDbBackupService({ db, dbPath, backupDir, logger: testLogger });
  return { db, dbPath, backupDir, service };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('DbBackupService', () => {
  it('runBackup crea un file e listBackups lo elenca', async () => {
    const { db, service } = setup();
    const res = await service.runBackup();
    expect(res.ok).toBe(true);
    expect(res.size).toBeGreaterThan(0);
    const list = await service.listBackups();
    expect(list.entries.map((e) => e.name)).toContain(res.name);
    db.$client.close();
  });

  it('pruneBackups mantiene solo i più recenti', async () => {
    const { db, service } = setup();
    await service.runBackup();
    await sleep(10);
    await service.runBackup();
    await sleep(10);
    await service.runBackup();
    expect((await service.listBackups()).entries).toHaveLength(3);

    const removed = await service.pruneBackups(2);
    expect(removed).toBe(1);
    expect((await service.listBackups()).entries).toHaveLength(2);
    db.$client.close();
  });

  it('restoreBackup mette in stage e applyPendingRestore lo applica al riavvio', async () => {
    const { db, dbPath, service } = setup();
    const res = await service.runBackup();
    // Modifica dopo il backup: deve sparire dopo il ripristino.
    seed(db, 'x2');
    db.$client.close();

    const restore = await service.restoreBackup(res.name);
    expect(restore.requiresRestart).toBe(true);
    expect(existsSync(`${dbPath}.pending-restore`)).toBe(true);

    applyPendingRestore(dbPath, testLogger);
    expect(existsSync(`${dbPath}.pending-restore`)).toBe(false);

    const db2 = createDb(dbPath);
    const rows = db2.select().from(schema.anime).all();
    expect(rows.find((r) => r.id === 'x1')).toBeDefined();
    expect(rows.find((r) => r.id === 'x2')).toBeUndefined();
    db2.$client.close();
  });

  it('restoreBackup rifiuta nomi non validi (anti traversal)', async () => {
    const { db, service } = setup();
    await expect(service.restoreBackup('../etc/passwd')).rejects.toThrow();
    await expect(service.restoreBackup('random.txt')).rejects.toThrow();
    db.$client.close();
  });
});
