import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { copyFile, readdir, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { BackupList, BackupRestoreResult, BackupRunResult } from '@animeunion/shared';
import type { Db } from '../db';
import { PreconditionError } from '../lib/errors';
import type { Logger } from '../lib/logger';

const BACKUP_PREFIX = 'animeunion-';
const BACKUP_EXT = '.db';
// Nome backup sicuro (evita path traversal nel restore): `animeunion-<token>.db`.
const BACKUP_NAME = /^animeunion-[\w-]+\.db$/;
const PENDING_SUFFIX = '.pending-restore';

export interface DbBackupService {
  /** Crea un backup consistente del DB adesso. */
  runBackup(): Promise<BackupRunResult>;
  /** Elenca i backup disponibili (più recenti prima). */
  listBackups(): Promise<BackupList>;
  /** Mantiene solo i `retention` backup più recenti; ritorna quanti ne ha eliminati. */
  pruneBackups(retention: number): Promise<number>;
  /**
   * Prepara il ripristino di un backup: il file viene messo in stage e applicato al prossimo
   * riavvio (non si sovrascrive un DB aperto). Vedi `applyPendingRestore`.
   */
  restoreBackup(name: string): Promise<BackupRestoreResult>;
}

export interface DbBackupDeps {
  db: Db;
  /** Percorso del file DB (DATABASE_PATH). `:memory:` disabilita il backup. */
  dbPath: string;
  /** Cartella dei backup. Default: `<dir del DB>/backups`. */
  backupDir?: string;
  logger: Logger;
}

/**
 * Applica un ripristino in attesa: se esiste `<dbPath>.pending-restore`, lo sposta su `dbPath`
 * (rimuovendo i sidecar -wal/-shm del WAL) PRIMA che il DB venga aperto. Da chiamare all'avvio,
 * prima di `createDb`. No-op per `:memory:` o se non c'è niente in attesa.
 */
export function applyPendingRestore(dbPath: string, logger?: Logger): void {
  if (dbPath === ':memory:') {
    return;
  }
  const pending = `${dbPath}${PENDING_SUFFIX}`;
  if (!existsSync(pending)) {
    return;
  }
  try {
    // I sidecar WAL del vecchio DB non sono validi per il file ripristinato: vanno rimossi.
    for (const sidecar of [`${dbPath}-wal`, `${dbPath}-shm`]) {
      if (existsSync(sidecar)) {
        try {
          rmSync(sidecar);
        } catch {
          // best-effort
        }
      }
    }
    renameSync(pending, dbPath);
    logger?.info('Ripristino DB applicato dal backup in attesa');
  } catch (error) {
    logger?.error({ err: error }, "Applicazione del ripristino DB fallita all'avvio");
  }
}

export function createDbBackupService(deps: DbBackupDeps): DbBackupService {
  const { db, dbPath, logger } = deps;
  const backupDir = deps.backupDir ?? join(dirname(resolve(dbPath)), 'backups');

  function assertEnabled(): void {
    if (dbPath === ':memory:') {
      throw new PreconditionError('Il backup non è disponibile con un database in memoria.');
    }
  }

  const service: DbBackupService = {
    async runBackup(): Promise<BackupRunResult> {
      assertEnabled();
      mkdirSync(backupDir, { recursive: true });
      // Token: timestamp leggibile + suffisso casuale (nomi unici anche per backup ravvicinati).
      const token = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 6)}`;
      const name = `${BACKUP_PREFIX}${token}${BACKUP_EXT}`;
      const dest = join(backupDir, name);
      // better-sqlite3: backup online consistente anche con WAL attivo.
      await db.$client.backup(dest);
      const size = (await stat(dest)).size;
      logger.info({ name, size }, 'Backup DB creato');
      return { ok: true, name, size };
    },

    async listBackups(): Promise<BackupList> {
      const names = await readdir(backupDir).catch(() => [] as string[]);
      const entries: BackupList['entries'] = [];
      for (const name of names) {
        if (!BACKUP_NAME.test(name)) {
          continue;
        }
        const st = await stat(join(backupDir, name)).catch(() => null);
        if (!st) {
          continue;
        }
        entries.push({ name, size: st.size, createdAt: st.mtime.toISOString() });
      }
      entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { entries };
    },

    async pruneBackups(retention): Promise<number> {
      const { entries } = await service.listBackups();
      const toRemove = entries.slice(Math.max(0, retention));
      let removed = 0;
      for (const entry of toRemove) {
        await rm(join(backupDir, entry.name), { force: true }).catch(() => {});
        removed += 1;
      }
      return removed;
    },

    async restoreBackup(name): Promise<BackupRestoreResult> {
      assertEnabled();
      // Solo un nome file semplice dentro backupDir (no traversal).
      if (!BACKUP_NAME.test(name) || basename(name) !== name) {
        throw new PreconditionError('Nome backup non valido.');
      }
      const src = join(backupDir, name);
      if (!existsSync(src)) {
        throw new PreconditionError('Backup non trovato.');
      }
      // Copia (non move) così il backup resta disponibile; lo swap avviene al riavvio.
      await copyFile(src, `${dbPath}${PENDING_SUFFIX}`);
      logger.info({ name }, 'Ripristino DB messo in stage: sarà applicato al riavvio');
      return { ok: true, requiresRestart: true };
    },
  };

  return service;
}
