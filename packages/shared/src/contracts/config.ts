import { z } from 'zod';
import { languageSchema } from './enums';
import { themeAccentSchema } from './theme';

// Sezioni della home, riordinabili e nascondibili dall'utente (Step 14). L'enum vincola gli id
// salvati; label/icona/ordine di default vivono sul frontend (registro `HOME_SECTIONS`).
export const homeSectionIdSchema = z.enum([
  'hero',
  'latestEpisodes',
  'continueWatching',
  'onAirToday',
  'currentSeason',
  'topRated',
  'recentlyAdded',
  'news',
]);
export type HomeSectionId = z.infer<typeof homeSectionIdSchema>;

export const homeSectionPrefSchema = z.object({
  id: homeSectionIdSchema,
  visible: z.boolean(),
});
export type HomeSectionPref = z.infer<typeof homeSectionPrefSchema>;

// Ordine + visibilità delle sezioni home. `[]` = "usa l'ordine di default" (il frontend fa il merge
// col registro). `.catch([])`: un valore corrotto/legacy non deve far fallire l'intero parse di
// getAll → ricade su `[]` (= default) restando un campo non critico.
export const homeLayoutSchema = z.array(homeSectionPrefSchema).default([]).catch([]);

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
  // Verifica l'integrità di ogni file scaricato con ffmpeg (decodifica completa) prima di
  // finalizzarlo: cattura le corruzioni a metà file. Opt-in: costa CPU/tempo per file.
  verifyDownloads: z.boolean().default(false),
  // Cestino: le eliminazioni dal gestore file spostano in `.trash/` invece di cancellare subito,
  // così sono recuperabili. Pulizia automatica oltre `trashRetentionDays`.
  trashEnabled: z.boolean().default(true),
  trashRetentionDays: z.number().int().positive().default(30),
  // Backup automatico del database SQLite (seguiti, coda, libreria, override): copia consistente
  // schedulata, con retention a N copie. Opt-in.
  dbBackupEnabled: z.boolean().default(false),
  dbBackupIntervalHours: z.number().int().positive().default(24),
  dbBackupRetention: z.number().int().positive().default(7),
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
  // Scrive i sidecar NFO + artwork (poster/fanart) accanto ai video per Jellyfin/Plex/Kodi/Emby.
  writeNfo: z.boolean().default(false),
  // Integrazione Jellyfin: URL del server + API key (segreta) + refresh automatico a fine download.
  jellyfinServerUrl: z.string().default(''),
  jellyfinApiKey: z.string().default(''),
  jellyfinAutoRefresh: z.boolean().default(false),
  // Personalizzazione della home: ordine e visibilità delle sezioni (vuoto = ordine di default).
  homeLayout: homeLayoutSchema,
  // Neural Export (upscale XQ/XQ+ Anime4K via worker GPU esterno). Master off di default.
  neuralExportEnabled: z.boolean().default(false),
  // URL del worker GPU sulla LAN (es. http://192.168.1.50:8787). Vuoto = non configurato.
  neuralWorkerUrl: z.string().default(''),
  // Token condiviso col worker (segreto: cifrato a riposo, mascherato al frontend).
  neuralWorkerToken: z.string().default(''),
});
export type AppConfig = z.infer<typeof appConfigSchema>;

export const configKeySchema = appConfigSchema.keyof();
export type ConfigKey = z.infer<typeof configKeySchema>;

// Placeholder per i valori segreti (es. token Telegram) inviati al frontend: il valore
// reale non lascia mai il server. Se il client lo rimanda invariato = "non modificare".
export const SECRET_MASK = '••••••••';

// Chiavi di config che NON devono mai essere inviate in chiaro al frontend.
export const SECRET_CONFIG_KEYS: ConfigKey[] = [
  'telegramBotToken',
  'jellyfinApiKey',
  'neuralWorkerToken',
];

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
