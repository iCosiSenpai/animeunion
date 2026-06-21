import { z } from 'zod';
import { languageSchema } from './enums';
import { themeAccentSchema } from './theme';

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
  // Avvisa quando una serie seguita ottiene una nuova stagione/contenuto correlato.
  notifyNewSeasons: z.boolean().default(true),
  // Inoltra le notifiche come push del browser (richiede HTTPS + sottoscrizione).
  notifyWebPush: z.boolean().default(true),
  // Token del bot Telegram (da @BotFather) e chat id destinatario. Segreti in SQLite
  // (coerente con il modello token-in-SQLite); vuoti = usa il fallback da env, se presente.
  telegramBotToken: z.string().default(''),
  telegramChatId: z.string().default(''),
  // Tema: colore accent (palette) e wallpaper di sfondo (URL; vuoto = nessuno sfondo).
  themeAccent: themeAccentSchema.default('green'),
  themeBackgroundUrl: z.string().default(''),
  // Animazioni e micro-interazioni dell'interfaccia (off = movimento ridotto).
  animationsEnabled: z.boolean().default(true),
});
export type AppConfig = z.infer<typeof appConfigSchema>;

export const configKeySchema = appConfigSchema.keyof();
export type ConfigKey = z.infer<typeof configKeySchema>;

// Placeholder per i valori segreti (es. token Telegram) inviati al frontend: il valore
// reale non lascia mai il server. Se il client lo rimanda invariato = "non modificare".
export const SECRET_MASK = '••••••••';

// Chiavi di config che NON devono mai essere inviate in chiaro al frontend.
export const SECRET_CONFIG_KEYS: ConfigKey[] = ['telegramBotToken'];

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
