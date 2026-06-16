import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';
import { createAuthService } from '../services/auth-service';
import { createCatalogService } from '../services/catalog-service';
import { createConfigService } from '../services/config-service';
import { createDownloadService } from '../services/download-service';
import { createFavoritesService } from '../services/favorites-service';
import { createFollowService } from '../services/follow-service';
import { createHomeService } from '../services/home-service';
import { createProfileService } from '../services/profile-service';
import { createMockSource } from '../sources/mock-source';
import { createTestDb, testLogger } from '../test/helpers';
import { type Context, createCallerFactory } from '../trpc';
import { appRouter } from './index';

function makeCaller() {
  const db = createTestDb();
  const source = createMockSource();
  const config = createConfigService({ db });
  const catalog = createCatalogService({ db, source, config, logger: testLogger });
  const follow = createFollowService({ db, source, logger: testLogger });
  const favorites = createFavoritesService({ db, source, catalog, config, logger: testLogger });
  const profile = createProfileService({ source, logger: testLogger });
  const home = createHomeService({ source, logger: testLogger });
  const auth = createAuthService({ db, baseUrl: 'https://api.test', logger: testLogger });
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
    logger: testLogger,
  });
  const ctx: Context = {
    db,
    source,
    services: { catalog, follow, favorites, profile, home, config, auth, download },
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
    await caller.config.set({ key: 'maxConcurrent', value: 4 });

    const all = await caller.config.getAll();
    expect(all.maxConcurrent).toBe(4);

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
});
