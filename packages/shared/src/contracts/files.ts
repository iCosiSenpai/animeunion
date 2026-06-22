import { z } from 'zod';

/** Una voce (cartella o file) del gestore file incorporato. */
export const fileEntrySchema = z.object({
  name: z.string(),
  /** Percorso assoluto. */
  path: z.string(),
  type: z.enum(['dir', 'file']),
  size: z.number().nullable(),
  /** Per i file video tracciati nel DB: id dell'episode_file collegato (null = orfano/non tracciato). */
  episodeFileId: z.string().nullable(),
  /**
   * File "extra" (sigle/OP/ED, backdrops, theme-music, trailers, Specials…): non è un episodio
   * da collegare, quindi non va segnalato come orfano.
   */
  extra: z.boolean().default(false),
  /**
   * Per le cartelle: true se contiene (a qualunque profondità) almeno un file scaricato dall'app
   * (un `episode_file.localPath` tracciato). false = cartella "non importata" dall'app.
   */
  managed: z.boolean().default(false),
});
export type FileEntry = z.infer<typeof fileEntrySchema>;

export const fileListSchema = z.object({
  /** Percorso corrente ('' = elenco delle cartelle radice). */
  path: z.string(),
  /** Cartella superiore raggiungibile, oppure null se si è a livello delle radici. */
  parent: z.string().nullable(),
  /** true se `path` è una delle cartelle radice configurate. */
  atRoot: z.boolean(),
  entries: fileEntrySchema.array(),
});
export type FileList = z.infer<typeof fileListSchema>;

export const fileOpResultSchema = z.object({
  ok: z.boolean(),
  /** Percorso risultante (per rename/move/mkdir). */
  path: z.string().optional(),
  /** Numero di elementi interessati (per le operazioni di massa: rinomina schema, prune). */
  count: z.number().optional(),
});
export type FileOpResult = z.infer<typeof fileOpResultSchema>;

export const fileListInputSchema = z.object({ path: z.string().optional() });
export const fileRenameInputSchema = z.object({
  path: z.string().min(1),
  newName: z.string().min(1),
});
export const fileMoveInputSchema = z.object({
  path: z.string().min(1),
  destDir: z.string().min(1),
});
export const fileDeleteInputSchema = z.object({ path: z.string().min(1) });
export const fileMkdirInputSchema = z.object({
  parent: z.string().min(1),
  name: z.string().min(1),
});
/** Collega un file orfano a un episodio: lo sposta al percorso atteso e aggiorna il DB. */
export const fileRelinkInputSchema = z.object({
  path: z.string().min(1),
  episodeFileId: z.string().min(1),
});
/** Rinomina/sposta tutti i file tracciati sotto una cartella secondo lo schema del renamer. */
export const fileRenameToSchemeInputSchema = z.object({ path: z.string().min(1) });
/** Rimuove ricorsivamente le cartelle vuote sotto un percorso. */
export const filePruneEmptyInputSchema = z.object({ path: z.string().min(1) });
