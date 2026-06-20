import { z } from 'zod';
import { languageSchema } from './enums';

export const appConfigSchema = z.object({
  // Cartelle di download (impostate nelle Impostazioni dell'app, NON nel .env).
  // Routing per (tipo × lingua); le DUB/film, se vuote, ricadono sulla serie SUB.
  // seriesPathSub vuota = "non configurato": innesca il wizard e blocca i download.
  seriesPathSub: z.string().default(''),
  seriesPathDub: z.string().default(''),
  moviePathSub: z.string().default(''),
  moviePathDub: z.string().default(''),
  language: languageSchema.default('SUB_ITA'),
  maxConcurrent: z.number().int().min(1).max(3).default(1),
  catalogSyncHours: z.number().int().positive().default(24),
  autoDownload: z.boolean().default(false),
  favoritesSyncMinutes: z.number().int().positive().default(10),
  languageFallback: z.boolean().default(false),
  queueRetentionDays: z.number().int().positive().default(7),
  notifyOnComplete: z.boolean().default(true),
  // Inoltro delle notifiche a Telegram. Credenziali configurabili dall'app (qui sotto);
  // in alternativa via env TELEGRAM_BOT_TOKEN/CHAT_ID (fallback).
  notifyTelegram: z.boolean().default(false),
  // Token del bot Telegram (da @BotFather) e chat id destinatario. Segreti in SQLite
  // (coerente con il modello token-in-SQLite); vuoti = usa il fallback da env, se presente.
  telegramBotToken: z.string().default(''),
  telegramChatId: z.string().default(''),
});
export type AppConfig = z.infer<typeof appConfigSchema>;

export const configKeySchema = appConfigSchema.keyof();
export type ConfigKey = z.infer<typeof configKeySchema>;

export const configSetInputSchema = z.object({
  key: configKeySchema,
  value: z.unknown(),
});
export type ConfigSetInput = z.infer<typeof configSetInputSchema>;

// Info statiche dell'app (versione). Endpoint leggero, usato dal footer.
export const appInfoSchema = z.object({
  version: z.string(),
});
export type AppInfo = z.infer<typeof appInfoSchema>;
