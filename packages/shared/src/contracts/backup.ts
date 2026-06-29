import { z } from 'zod';

/** Una copia di backup del database (file SQLite consistente). */
export const backupEntrySchema = z.object({
  /** Nome file del backup (anche id per il ripristino). */
  name: z.string(),
  /** Dimensione in byte. */
  size: z.number(),
  /** Data di creazione (ISO). */
  createdAt: z.string(),
});
export type BackupEntry = z.infer<typeof backupEntrySchema>;

export const backupListSchema = z.object({ entries: backupEntrySchema.array() });
export type BackupList = z.infer<typeof backupListSchema>;

export const backupRunResultSchema = z.object({
  ok: z.boolean(),
  /** Nome del backup creato. */
  name: z.string(),
  size: z.number(),
});
export type BackupRunResult = z.infer<typeof backupRunResultSchema>;

export const backupRestoreInputSchema = z.object({ name: z.string().min(1) });

export const backupRestoreResultSchema = z.object({
  ok: z.boolean(),
  /** Il ripristino richiede il riavvio del server per essere applicato. */
  requiresRestart: z.boolean(),
});
export type BackupRestoreResult = z.infer<typeof backupRestoreResultSchema>;
