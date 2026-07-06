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
  // Chiave per cifrare i segreti a riposo nel DB (password AnimeUnion, token di accesso, token
  // Telegram, API key Jellyfin) con AES-256-GCM. In production e' obbligatoria (vedi superRefine):
  // senza, i segreti finirebbero in chiaro nel DB e nei backup.
  AUTH_ENCRYPT_KEY: z.string().optional(),
  NODE_ENV: z.string().optional(),
});

const parsedEnvSchema = envSchema.superRefine((value, ctx) => {
  if (value.NODE_ENV === 'production' && !value.AUTH_ENCRYPT_KEY?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AUTH_ENCRYPT_KEY'],
      message:
        'AUTH_ENCRYPT_KEY obbligatoria in production: senza, i segreti (password AnimeUnion, token, Telegram, Jellyfin) verrebbero salvati in chiaro nel DB e nei backup. Impostala in .env (vedi .env.example).',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = parsedEnvSchema.parse(process.env);
