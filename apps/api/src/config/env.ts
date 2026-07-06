import { z } from 'zod';

const envSchema = z.object({
  ANIMEUNION_API_URL: z.string().url().default('https://api.animeunion.tv/api/v1/integration'),
  SOURCE_MODE: z.enum(['api', 'scraper', 'mock']).default('api'),
  ANIMEUNION_EMAIL: z.string().optional(),
  ANIMEUNION_PASSWORD: z.string().optional(),
  RATE_LIMIT_MS: z.coerce.number().int().positive().default(1000),
  DATABASE_PATH: z.string().default('./data/animeunion.db'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  // Lista di origin CORS consentiti (separati da virgola). Default: same-origin (nessun origin
  // cross-site ammesso) — il browser parla sempre col web server, che fa da proxy verso l'API, quindi
  // non servono origin cross-site. Impostare per abilitarne di specifici; `*` riabilita il reflect-all.
  CORS_ORIGINS: z.string().optional(),
  // Fidati degli header X-Forwarded-* dietro un reverse proxy: 'true'/'false', un numero di hop,
  // oppure una lista di IP/CIDR. Serve al rate-limit REST per-IP (altrimenti tutti condividono l'IP
  // del proxy e il bucket collassa). Default: false.
  TRUST_PROXY: z.string().optional(),
  // Notifiche Telegram (opzionali): bot token + chat id. Segreti → solo env/.env.
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  // Escape hatch: 'true' disabilita il blocco passcode della web UI (recupero).
  WEB_LOCK_DISABLED: z.string().optional(),
  // Chiave per cifrare la password AnimeUnion salvata nel DB (AES-256-GCM).
  // Se assente, la password è salvata in chiaro con un warning nel log.
  AUTH_ENCRYPT_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
