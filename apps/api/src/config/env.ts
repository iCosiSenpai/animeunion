import { z } from 'zod';

const envSchema = z.object({
  ANIMEUNION_API_URL: z.string().url().default('https://api.animeunion.tv/api/v1/integration'),
  SOURCE_MODE: z.enum(['api', 'scraper', 'mock']).default('api'),
  ANIMEUNION_EMAIL: z.string().optional(),
  ANIMEUNION_PASSWORD: z.string().optional(),
  RATE_LIMIT_MS: z.coerce.number().int().positive().default(1000),
  DATABASE_PATH: z.string().default('./data/animeunion.db'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  // Lista di origin CORS consentiti (separati da virgola). Se vuoto, riflette l'origin
  // (comodo per LAN/self-hosted); impostare per restringere.
  CORS_ORIGINS: z.string().optional(),
  // Notifiche Telegram (opzionali): bot token + chat id. Segreti → solo env/.env.
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
