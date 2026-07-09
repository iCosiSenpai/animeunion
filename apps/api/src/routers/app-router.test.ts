import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SECRET_MASK } from '@animeunion/shared';
import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';
import { schema } from '../db';
import { createAuthService } from '../services/auth-service';
import { createCatalogService } from '../services/catalog-service';
import { createCloudBackupService } from '../services/cloud-backup-service';
import { createConfigService } from '../services/config-service';
import { createDbBackupService } from '../services/db-backup-service';
import { createDownloadService } from '../services/download-service';
import { createFavoritesService } from '../services/favorites-service';
import { createFileManagerService } from '../services/file-manager-service';
import { createFollowService } from '../services/follow-service';
import { createHomeService } from '../services/home-service';
import { createJellyfinService } from '../services/jellyfin-service';
import { createLibraryService } from '../services/library-service';
import { createLockService } from '../services/lock-service';
import { createNeuralExportService } from '../services/neural-export-service';
import { createNotificationService } from '../services/notification-service';
import { createProfileService } from '../services/profile-service';
import { createPushService } from '../services/push-service';
import { createRenamerService } from '../services/renamer-service';
import { createRequestAuthService } from '../services/request-auth-service';
import { createRequestService } from '../services/request-service';
import { createSeriesResolver } from '../services/series-resolver';
import { createSeriesService } from '../services/series-service';
import { createMockSource } from '../sources/mock-source';
import { createTestDb, testLogger } from '../test/helpers';
import { type Context, createCallerFactory } from '../trpc';
import { appRouter } from './index';

function makeCaller() {
  const db = createTestDb();
  const source = createMockSource();
  const config = createConfigService({ db });
  // cartella isolata e inesistente: la scansione non deve toccare la cartella reale di sviluppo.
  config.set('seriesPathSub', join(tmpdir(), `au-router-${Math.random().toString(36).slice(2)}`));
  const catalog = createCatalogService({ db, source, config, logger: testLogger });
  const follow = createFollowService({ db, source, logger: testLogger });
  const favorites = createFavoritesService({ db, source, catalog, config, logger: testLogger });
  const profile = createProfileService({ source, logger: testLogger });
  const home = createHomeService({ source, logger: testLogger });
  const auth = createAuthService({ db, baseUrl: 'https://api.test', logger: testLogger });
  const resolver = createSeriesResolver({ db });
  const renamer = createRenamerService({ db, config, seriesResolver: resolver });
  const library = createLibraryService({ db, config, renamer, resolver, logger: testLogger });
  const files = createFileManagerService({ db, config, renamer, logger: testLogger });
  const series = createSeriesService({ db, resolver, catalog, renamer, config });
  const notifications = createNotificationService({ db, config });
  const lock = createLockService({ db, env: { WEB_LOCK_DISABLED: undefined } });
  const requestAuth = createRequestAuthService({ db });
  const push = createPushService({ db, logger: testLogger });
  const jellyfin = createJellyfinService({ config, logger: testLogger });
  const backup = createDbBackupService({ db, dbPath: ':memory:', logger: testLogger });
  const cloudBackup = createCloudBackupService({ config, backup, logger: testLogger });
  const download = createDownloadService({
    db,
    worker: {
      enqueue: vi.fn().mockReturnValue('q-test-1'),
      cancel: vi.fn().mockReturnValue(false),
      retry: vi.fn().mockReturnValue(false),
      start: vi.fn(),
      stop: vi.fn(),
    } as never,
    catalog,
    config,
    renamer,
    logger: testLogger,
  });
  const requests = createRequestService({ db, catalog, resolver, follow, download, config });
  const neuralExport = createNeuralExportService({
    db,
    source,
    config,
    profile,
    renamer,
    logger: testLogger,
  });
  const ctx: Context = {
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
      files,
      series,
      notifications,
      lock,
      push,
      requestAuth,
      requests,
      jellyfin,
      backup,
      cloudBackup,
      neuralExport,
    },
    logger: testLogger,
  };
  return { caller: createCallerFactory(appRouter)(ctx), ctx };
}

describe('appRouter (integrazione)', () => {
  it('catalog.search ritorna una pagina di risultati', async () => {
    const { caller } = makeCaller();
    const result = await caller.catalog.search({ query: '' });
    expect(result.data).toHaveLength(24);
    expect(result.meta.total).toBe(50);
  });

  it('config.getAll/get mascherano il token Telegram (segreto mai in chiaro al FE)', async () => {
    const { caller, ctx } = makeCaller();
    expect((await caller.config.getAll()).telegramBotToken).toBe('');

    ctx.services.config.set('telegramBotToken', '123:ABC');

    expect((await caller.config.getAll()).telegramBotToken).toBe(SECRET_MASK);
    expect((await caller.config.get({ key: 'telegramBotToken' })).value).toBe(SECRET_MASK);
    // Il service interno resta veritiero (lo usa il notifier).
    expect(ctx.services.config.get('telegramBotToken')).toBe('123:ABC');
  });

  it('config.set ignora la maschera dei segreti (A4: non sovrascrive il valore reale)', async () => {
    const { caller, ctx } = makeCaller();
    ctx.services.config.set('telegramBotToken', '123:ABC');

    // Il FE rimanda il placeholder mascherato: no-op, il token reale resta intatto.
    const res = await caller.config.set({ key: 'telegramBotToken', value: SECRET_MASK });
    expect(res.value).toBe(SECRET_MASK);
    expect(ctx.services.config.get('telegramBotToken')).toBe('123:ABC');

    // Un valore reale nuovo invece aggiorna davvero.
    await caller.config.set({ key: 'telegramBotToken', value: '999:XYZ' });
    expect(ctx.services.config.get('telegramBotToken')).toBe('999:XYZ');
  });

  it('lock: passcode attivo blocca le procedure senza token e le sblocca col token', async () => {
    const { ctx } = makeCaller();
    ctx.services.lock.setPasscode('1234');

    const locked = createCallerFactory(appRouter)(ctx); // ctx.sessionToken undefined
    await expect(locked.catalog.search({ query: '' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    // status/unlock restano accessibili da bloccato
    expect((await locked.lock.status()).enabled).toBe(true);
    const res = await locked.lock.unlock({ passcode: '1234' });
    expect(res.ok).toBe(true);

    const unlocked = createCallerFactory(appRouter)({ ...ctx, sessionToken: res.token ?? '' });
    const search = await unlocked.catalog.search({ query: '' });
    expect(search.data.length).toBeGreaterThan(0);
  });

  it('push: publicKey VAPID e subscribe salvano la sottoscrizione', async () => {
    const { caller, ctx } = makeCaller();
    const { publicKey } = await caller.push.publicKey();
    expect(typeof publicKey).toBe('string');
    expect(publicKey.length).toBeGreaterThan(0);

    await caller.push.subscribe({
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'p256', auth: 'auth' },
    });
    expect(ctx.db.select().from(schema.pushSubscription).all()).toHaveLength(1);
  });

  it('catalog.bySlug ritorna il dettaglio validato dal contratto', async () => {
    const { caller } = makeCaller();
    const search = await caller.catalog.search({ query: '' });
    const slug = search.data[0]?.slug ?? '';

    const detail = await caller.catalog.bySlug({ slug });

    expect(detail.slug).toBe(slug);
    expect(detail.episodes.length).toBeGreaterThan(0);
  });

  it('catalog.bySlug inesistente mappa su TRPCError NOT_FOUND', async () => {
    const { caller } = makeCaller();
    await expect(caller.catalog.bySlug({ slug: 'inesistente' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(caller.catalog.bySlug({ slug: 'inesistente' })).rejects.toBeInstanceOf(TRPCError);
  });

  it('catalog.sync avvia il job in background e syncStatus lo riflette', async () => {
    const { caller } = makeCaller();
    const result = await caller.catalog.sync();
    expect(result.started).toBe(true);

    await vi.waitFor(async () => {
      const status = await caller.catalog.syncStatus();
      expect(status.running).toBe(false);
      expect(status.lastSyncedAt).not.toBeNull();
    });

    const recent = await caller.catalog.recent();
    expect(recent.meta.total).toBe(50);
  });

  it('episode.byAnime ed episode.byId risolvono la downloadUrl', async () => {
    const { caller } = makeCaller();
    const search = await caller.catalog.search({ query: '' });
    const slug = search.data[0]?.slug ?? '';

    const episodes = await caller.episode.byAnime({ animeSlug: slug });
    expect(episodes.length).toBeGreaterThan(0);

    const episodeId = episodes[0]?.id ?? '';
    const detail = await caller.episode.byId({ episodeId });
    expect(detail.id).toBe(episodeId);
    expect(detail.downloadUrl).toMatch(/^https?:\/\//);
  });

  it('calendar.week e calendar.day rispondono', async () => {
    const { caller } = makeCaller();
    const week = await caller.calendar.week();
    expect(week).toHaveLength(7);

    const day = await caller.calendar.day({ day: 'LUNEDI' });
    expect(day.day).toBe('LUNEDI');
  });

  it('follow.add, list, updateStatus e remove funzionano end-to-end', async () => {
    const { caller } = makeCaller();
    const search = await caller.catalog.search({ query: '' });
    const animeId = search.data[0]?.id ?? '';

    await caller.follow.add({ animeId, status: 'watching' });
    expect(await caller.follow.list()).toHaveLength(1);

    const updated = await caller.follow.updateStatus({ animeId, status: 'completed' });
    expect(updated.status).toBe('completed');

    await caller.follow.remove({ animeId });
    expect(await caller.follow.list()).toHaveLength(0);
  });

  it('config.set valida e config.getAll riflette il cambiamento', async () => {
    const { caller } = makeCaller();
    await caller.config.set({ key: 'maxConcurrent', value: 3 });

    const all = await caller.config.getAll();
    expect(all.maxConcurrent).toBe(3);

    await expect(caller.config.set({ key: 'maxConcurrent', value: 99 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('stats.dashboard aggrega i contatori dal DB', async () => {
    const { caller } = makeCaller();
    await caller.catalog.search({ query: '' });

    const stats = await caller.stats.dashboard();

    expect(stats.totalAnime).toBe(24);
    expect(stats.downloadedEpisodes).toBe(0);
    expect(stats.downloadQueueSize).toBe(0);
  });

  it('catalog.browse filtra e ordina i risultati', async () => {
    const { caller } = makeCaller();
    await caller.catalog.sync();

    const movies = await caller.catalog.browse({ query: '', type: 'MOVIE' });
    expect(movies.data.every((a) => a.type === 'MOVIE')).toBe(true);

    const byScore = await caller.catalog.browse({ query: '', sort: 'score' });
    const scores = byScore.data.map((a) => a.score ?? -1);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('catalog.filters restituisce generi e anni', async () => {
    const { caller } = makeCaller();
    await caller.catalog.sync();

    const filters = await caller.catalog.filters();

    expect(filters.genres.length).toBeGreaterThan(0);
    expect(filters.years.length).toBeGreaterThan(0);
  });

  it('download.queue/addEpisode/cancel passano dal router al service', async () => {
    const { caller } = makeCaller();
    const search = await caller.catalog.search({ query: '' });
    const anime = search.data[0];
    expect(anime).toBeDefined();
    if (!anime) return;

    const episodes = await caller.episode.byAnime({ animeSlug: anime.slug });
    const ep = episodes[0];
    expect(ep).toBeDefined();
    if (!ep) return;

    // La queue parte vuota.
    const empty = await caller.download.queue();
    expect(empty).toEqual([]);

    // Aggiungo un episodio. Il service delega al worker mock che ritorna un id.
    const added = await caller.download.addEpisode({ episodeFileId: ep.id });
    expect(added.queueId).toBe('q-test-1');

    // Cancel su un id non esistente ritorna false.
    const c = await caller.download.cancel({ queueId: 'non-esiste' });
    expect(c.cancelled).toBe(false);

    // clearCompleted ritorna il numero di righe terminali rimosse.
    const cleared = await caller.download.clearCompleted();
    expect(cleared.removed).toBe(0);
  });

  it('library.list/stats/scan rispondono con dati vuoti', async () => {
    const { caller } = makeCaller();

    const list = await caller.library.list();
    expect(list).toEqual([]);

    const stats = await caller.library.stats();
    expect(stats).toEqual({ totalEpisodes: 0, totalSizeBytes: 0, totalSeries: 0 });

    const scan = await caller.library.scan();
    expect(scan.found).toBe(0);
    expect(scan.missing).toBe(0);
    expect(scan.orphans).toBe(0);
  });

  it('me.watchlist e me.history restituiscono array', async () => {
    const { caller } = makeCaller();

    const watchlist = await caller.me.watchlist();
    expect(Array.isArray(watchlist)).toBe(true);

    const history = await caller.me.history();
    expect(Array.isArray(history)).toBe(true);
  });
});
