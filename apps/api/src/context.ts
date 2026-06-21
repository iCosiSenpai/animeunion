import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { type Env, env } from './config/env';
import { createDb, runMigrations, schema } from './db';
import { createDownloadWorker } from './lib/download-worker';
import { logger } from './lib/logger';
import { createTelegramNotifier } from './lib/telegram';
import { createAuthService } from './services/auth-service';
import { createCatalogService } from './services/catalog-service';
import { createConfigService } from './services/config-service';
import { createDownloadService } from './services/download-service';
import { createFavoritesService } from './services/favorites-service';
import { createFollowService } from './services/follow-service';
import { createHomeService } from './services/home-service';
import { createLibraryService } from './services/library-service';
import { createLockService } from './services/lock-service';
import { createNotificationService } from './services/notification-service';
import { createProfileService } from './services/profile-service';
import { createPushService } from './services/push-service';
import { createRenamerService } from './services/renamer-service';
import { createSeriesResolver } from './services/series-resolver';
import { createSeriesService } from './services/series-service';
import { createSource } from './sources';
import type { Context } from './trpc';

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle');

export function createAppContext(options: { env?: Env; databasePath?: string } = {}): Context {
  const resolvedEnv = options.env ?? env;
  const db = createDb(options.databasePath ?? resolvedEnv.DATABASE_PATH);
  runMigrations(db, migrationsFolder);
  const auth = createAuthService({
    db,
    baseUrl: resolvedEnv.ANIMEUNION_API_URL,
    email: resolvedEnv.ANIMEUNION_EMAIL,
    password: resolvedEnv.ANIMEUNION_PASSWORD,
    logger,
    rateLimitMs: resolvedEnv.RATE_LIMIT_MS,
  });
  const source = createSource({
    env: resolvedEnv,
    getToken: () => auth.getToken(),
    onAuthError: () => auth.invalidateAndRelogin(),
  });
  const config = createConfigService({ db });
  const telegram = createTelegramNotifier({
    // Config-DB (Impostazioni) ha precedenza; env resta fallback per i deploy esistenti.
    getCredentials: () => ({
      botToken: config.get('telegramBotToken') || resolvedEnv.TELEGRAM_BOT_TOKEN,
      chatId: config.get('telegramChatId') || resolvedEnv.TELEGRAM_CHAT_ID,
    }),
    logger,
  });
  const push = createPushService({ db, logger });
  const notifications = createNotificationService({ db, config, telegram, push, logger });
  const catalog = createCatalogService({
    db,
    source,
    config,
    logger,
    onSyncComplete: (synced) => {
      notifications.create({
        type: 'sync_complete',
        title: 'Catalogo aggiornato',
        body: `${synced} titol${synced === 1 ? 'o' : 'i'} sincronizzati`,
      });
    },
  });
  const follow = createFollowService({ db, source, logger });
  const favorites = createFavoritesService({ db, source, catalog, config, logger });
  const profile = createProfileService({ source, logger });
  const home = createHomeService({ source, logger });
  const resolver = createSeriesResolver({ db });
  const renamer = createRenamerService({ db, config, seriesResolver: resolver });
  const library = createLibraryService({ db, config, renamer, resolver, logger });
  const series = createSeriesService({ db, resolver, catalog, renamer, config });

  function animeTitleOf(animeId: string): string {
    const row = db
      .select({ title: schema.anime.title, titleIta: schema.anime.titleIta })
      .from(schema.anime)
      .where(eq(schema.anime.id, animeId))
      .get();
    return row?.titleIta ?? row?.title ?? 'Anime';
  }

  const worker = createDownloadWorker({ db, catalog, config, logger, renamer });
  const download = createDownloadService({
    db,
    worker,
    catalog,
    config,
    logger,
    onAutoEnqueued: (animeId, count) => {
      notifications.create({
        type: 'new_episode',
        title: `Nuovi episodi: ${animeTitleOf(animeId)}`,
        body: `${count} episod${count === 1 ? 'io' : 'i'} accodati automaticamente`,
        animeId,
      });
    },
  });

  // Notifiche dagli eventi del worker (rispetta i toggle di config).
  function describeEpisode(episodeFileId: string): {
    title: string;
    animeId: string | null;
    epNum: number | null;
  } {
    const row = db
      .select({
        title: schema.anime.title,
        titleIta: schema.anime.titleIta,
        animeId: schema.anime.id,
        epNum: schema.episode.number,
      })
      .from(schema.episodeFile)
      .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
      .innerJoin(schema.anime, eq(schema.anime.id, schema.episode.animeId))
      .where(eq(schema.episodeFile.id, episodeFileId))
      .get();
    if (!row) {
      return { title: 'Episodio', animeId: null, epNum: null };
    }
    return { title: row.titleIta ?? row.title, animeId: row.animeId, epNum: row.epNum };
  }

  worker.on('complete', ({ episodeFileId }) => {
    if (!config.get('notifyOnComplete')) {
      return;
    }
    const d = describeEpisode(episodeFileId);
    notifications.create({
      type: 'download_complete',
      title: `Scaricato: ${d.title}`,
      body: d.epNum != null ? `Episodio ${d.epNum}` : null,
      animeId: d.animeId,
    });
  });

  worker.on('failed', ({ episodeFileId, error, retry }) => {
    if (retry) {
      return; // notifica solo i fallimenti definitivi
    }
    const d = describeEpisode(episodeFileId);
    notifications.create({
      type: 'download_failed',
      title: `Download fallito: ${d.title}`,
      body: error,
      animeId: d.animeId,
    });
  });

  const lock = createLockService({ db, env: resolvedEnv });

  return {
    db,
    source,
    services: {
      catalog,
      follow,
      favorites,
      profile,
      home,
      config,
      auth,
      download,
      library,
      series,
      notifications,
      lock,
      push,
    },
    logger,
  };
}
