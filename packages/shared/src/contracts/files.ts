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
