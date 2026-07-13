import { z } from 'zod';

/**
 * Stato di un singolo controllo del Doctor (monitoraggio attivo e continuo).
 * A differenza di `health` (che ricalcola tutto al volo ad ogni chiamata), il Doctor mantiene lo
 * stato tra un tick e l'altro: sa quando una condizione è passata da ok a critica (per notificare
 * l'allerta) e viceversa (per notificare il ripristino e togliere l'alert da solo).
 */
export const doctorCheckStatusSchema = z.enum(['ok', 'critical']);
export type DoctorCheckStatus = z.infer<typeof doctorCheckStatusSchema>;

/** Categoria del controllo: raggruppa i check omogenei (una cartella per riga, disco, API, ...). */
export const doctorCheckCategorySchema = z.enum(['writable', 'disk', 'api', 'jellyfin']);
export type DoctorCheckCategory = z.infer<typeof doctorCheckCategorySchema>;

export const doctorCheckSchema = z.object({
  /** Id stabile del check (es. `writable:seriesPathSub`, `disk:/media/Anime`, `api`). */
  id: z.string(),
  category: doctorCheckCategorySchema,
  label: z.string(),
  status: doctorCheckStatusSchema,
  /** Dettaglio leggibile (percorso, byte liberi, messaggio d'errore). */
  detail: z.string().nullable(),
  lastCheckedAt: z.string(),
});
export type DoctorCheck = z.infer<typeof doctorCheckSchema>;

export const doctorStateSchema = z.object({
  /** true se nessun check è in stato critico. */
  healthy: z.boolean(),
  /** Numero di check attualmente critici (comodo per badge/footer). */
  criticalCount: z.number().int(),
  /** Timestamp ISO dell'ultima esecuzione dei controlli, `null` se non ancora eseguiti. */
  lastRunAt: z.string().nullable(),
  checks: z.array(doctorCheckSchema),
});
export type DoctorState = z.infer<typeof doctorStateSchema>;
