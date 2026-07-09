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

/** Stato del collegamento con Google Drive (backup cloud bring-your-own client). */
export const googleDriveStatusSchema = z.object({
  /** Un refresh token è salvato: l'app può caricare senza nuovo consenso. */
  connected: z.boolean(),
  /** L'utente ha attivato il backup automatico su Drive (`gdriveEnabled`). */
  enabled: z.boolean(),
  /** Le credenziali del client OAuth (id + secret) sono state inserite. */
  clientConfigured: z.boolean(),
  /** La cartella Drive dell'app è già stata creata (id salvato). */
  folderConfigured: z.boolean(),
  /** Ultimo upload riuscito (ISO), o null se mai. In memoria: si azzera al riavvio. */
  lastUploadAt: z.string().nullable(),
  /** Nome dell'ultimo file caricato su Drive, o null. */
  lastUploadName: z.string().nullable(),
  /** Ultimo errore di upload (messaggio), o null. In memoria: si azzera al riavvio. */
  lastError: z.string().nullable(),
});
export type GoogleDriveStatus = z.infer<typeof googleDriveStatusSchema>;

/** URL di consenso OAuth da aprire nel browser per collegare Google Drive. */
export const googleAuthUrlSchema = z.object({ url: z.string() });
export type GoogleAuthUrl = z.infer<typeof googleAuthUrlSchema>;

/** Il codice di autorizzazione incollato dall'utente dopo il redirect loopback. */
export const googleExchangeInputSchema = z.object({ code: z.string().min(1) });

/** Esito di un upload manuale su Drive. */
export const googleBackupResultSchema = z.object({
  ok: z.boolean(),
  /** Nome del file caricato, se andato a buon fine. */
  name: z.string().nullable(),
});
export type GoogleBackupResult = z.infer<typeof googleBackupResultSchema>;
