import type { AnimeSource } from '@animeunion/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '../db';
import { NotFoundError } from '../lib/errors';
import { createMockSource } from '../sources/mock-source';
import { createTestDb, testLogger } from '../test/helpers';
import { createCatalogService } from './catalog-service';
import { createConfigService } from './config-service';

function countingSource(): { source: AnimeSource; calls: () => number } {
  const inner = createMockSource();
  let calls = 0;
  const source = new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') {
        return value;
      }
      return (...args: unknown[]) => {
        calls++;
        return value.apply(target, args);
      };
    },
  });
  return { source, calls: () => calls };
}

function makeService(overrides: { now?: () => Date } = {}) {
  const db = createTestDb();
  const { source, calls } = countingSource();
  const config = createConfigService({ db });
  const service = createCatalogService({
    db,
    source,
    config,
    logger: testLogger,
    now: overrides.now,
  });
  return { db, service, calls };
}

async function firstSlug(service: ReturnType<typeof makeService>['service']): Promise<string> {
  const result = await service.search({ query: '', page: 1 });
  const first = result.data[0];
  if (!first) {
    throw new Error('catalogo mock vuoto');
  }
  return first.slug;
}

describe('CatalogService', () => {
  it('getBySlug scarica dal source, salva anime, generi ed episodi', async () => {
    const { db, service } = makeService();
    const slug = await firstSlug(service);

    const detail = await service.getBySlug(slug);

    expect(detail.slug).toBe(slug);
    expect(detail.episodes.length).toBeGreaterThan(0);
    const row = db.select().from(schema.anime).where(eq(schema.anime.slug, slug)).get();
    expect(row).toBeDefined();
    const episodes = db
      .select()
      .from(schema.episode)
      .where(eq(schema.episode.animeId, detail.id))
      .all();
    expect(episodes.length).toBeGreaterThan(0);
  });

  it('getBySlug con cache fresca non richiama il source', async () => {
    const { service, calls } = makeService();
    const slug = await firstSlug(service);
    await service.getBySlug(slug);
    const before = calls();

    const detail = await service.getBySlug(slug);

    expect(detail.slug).toBe(slug);
    expect(calls()).toBe(before);
  });

  it('getBySlug inesistente lancia NotFoundError', async () => {
    const { service } = makeService();
    await expect(service.getBySlug('slug-inesistente')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('search senza sync passa dal source e aggiorna il DB incrementalmente', async () => {
    const { db, service } = makeService();

    const result = await service.search({ query: '', page: 1 });

    expect(result.data).toHaveLength(24);
    const saved = db.select().from(schema.anime).all();
    expect(saved).toHaveLength(24);
  });

  it('search con cache fresca legge solo dal DB', async () => {
    const { service, calls } = makeService();
    await service.syncCatalog();
    const before = calls();

    const result = await service.search({ query: '', page: 1 });

    expect(result.data).toHaveLength(24);
    expect(result.meta.total).toBe(50);
    expect(calls()).toBe(before);
  });

  it('search con cache scaduta torna a chiamare il source', async () => {
    let currentNow = new Date('2026-06-10T12:00:00.000Z');
    const { service, calls } = makeService({ now: () => currentNow });
    await service.syncCatalog();
    currentNow = new Date('2026-06-11T13:00:00.000Z');
    const before = calls();

    await service.search({ query: '', page: 1 });

    expect(calls()).toBeGreaterThan(before);
  });

  it('syncCatalog importa tutto il catalogo e scrive il timestamp', async () => {
    const { db, service } = makeService();

    const result = await service.syncCatalog();

    expect(result.synced).toBe(50);
    expect(db.select().from(schema.anime).all()).toHaveLength(50);
    const status = service.syncStatus();
    expect(status.running).toBe(false);
    expect(status.lastSyncedAt).not.toBeNull();
  });

  it('recent e topRated ordinano correttamente', async () => {
    const { service } = makeService();
    await service.syncCatalog();

    const top = await service.topRated(1);
    const scores = top.data.map((anime) => anime.score ?? -1);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);

    const recent = await service.recent(1);
    expect(recent.data).toHaveLength(24);
  });

  it('getEpisodeFile risolve la downloadUrl mancante via source e la persiste', async () => {
    const { db, service } = makeService();
    const slug = await firstSlug(service);
    const detail = await service.getBySlug(slug);
    const episode = detail.episodes[0];
    if (!episode) {
      throw new Error('nessun episodio');
    }

    const file = await service.getEpisodeFile(episode.id);

    expect(file.downloadUrl).toMatch(/^https?:\/\//);
    const row = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, episode.id))
      .get();
    expect(row?.downloadUrl).toBe(file.downloadUrl);
  });

  it('getEpisodeFile inesistente lancia NotFoundError', async () => {
    const { service } = makeService();
    await expect(service.getEpisodeFile('non-esiste')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('listEpisodes ritorna gli episodi con id coerenti col DB', async () => {
    const { service } = makeService();
    const slug = await firstSlug(service);

    const episodes = await service.listEpisodes(slug);

    expect(episodes.length).toBeGreaterThan(0);
    expect(episodes[0]?.id).toMatch(/_e\d+_/);
  });

  it('getCalendar usa la cache in-memory alla seconda chiamata', async () => {
    const { service, calls } = makeService();
    await service.getCalendar();
    const before = calls();

    const week = await service.getCalendar();

    expect(week).toHaveLength(7);
    expect(calls()).toBe(before);
  });

  it('getCalendarDay filtra il giorno richiesto', async () => {
    const { service } = makeService();
    const entry = await service.getCalendarDay('LUNEDI');
    expect(entry.day).toBe('LUNEDI');
  });
});
