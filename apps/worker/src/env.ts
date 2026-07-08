import { z } from 'zod';

/**
 * Config del worker Neural Export (servizio nativo Windows sul PC con GPU). Il token e' obbligatorio:
 * senza, il worker rifiuta di partire (evita un endpoint di render aperto sulla LAN).
 */
const envSchema = z.object({
  WORKER_PORT: z.coerce.number().int().positive().default(8787),
  WORKER_HOST: z.string().default('0.0.0.0'),
  // Token condiviso col NAS. Obbligatorio.
  WORKER_TOKEN: z
    .string()
    .min(1, 'WORKER_TOKEN obbligatorio: senza, il render sarebbe aperto sulla LAN'),
  // Path dell'ffmpeg con --enable-libplacebo+Vulkan. Default: 'ffmpeg' (dal PATH).
  WORKER_FFMPEG_PATH: z.string().default('ffmpeg'),
  WORKER_SHADER_CACHE: z.string().default('./data/shaders'),
  WORKER_WORK_DIR: z.string().default('./data/work'),
  // Job piu' vecchi di N ore vengono ripuliti (file temporanei). Default 24h.
  WORKER_JOB_RETENTION_HOURS: z.coerce.number().int().positive().default(24),
});

export type WorkerEnv = z.infer<typeof envSchema>;

export function loadEnv(): WorkerEnv {
  return envSchema.parse(process.env);
}
