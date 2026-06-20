import type { AnimeDetail, AnimeSource } from '@animeunion/shared';
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
    expect(detail.episodes[0]?.downloadStatus).toBe('not_downloaded');
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

  it('getBySlug serve le relazioni anche dal percorso cache DB (fix "indietro")', async () => {
    const db = createTestDb();
    const config = createConfigService({ db });
    const ts = new Date().toISOString();
    // L'anime correlato deve esistere (FK su anime_relation + join di lettura).
    db.insert(schema.anime)
      .values({
        id: 'rel-1',
        slug: 'related-anime',
        title: 'Related Anime',
        titleIta: null,
        type: 'TV',
        status: 'COMPLETED',
        coverImage: 'https://cdn.test/rel.jpg',
        episodeCount: 0,
        seasonYear: 2024,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    const detail: AnimeDetail = {
      id: 'parent-1',
      slug: 'parent',
      title: 'Parent',
      titleIta: null,
      coverImage: null,
      type: 'TV',
      status: 'ONGOING',
      season: null,
      seasonYear: 2026,
      score: null,
      genres: [],
      availableLanguages: ['SUB_ITA'],
      seriesId: null,
      seasonNumber: null,
      titleEng: null,
      titleJpn: null,
      synopsis: null,
      synopsisEng: null,
      bannerImage: null,
      trailerUrl: null,
      studio: null,
      episodeCount: 1,
      episodeDuration: null,
      malId: null,
      anilistId: null,
      relatedAnime: [
        {
          id: 'rel-1',
          slug: 'related-anime',
          title: 'Related Anime',
          titleIta: null,
          coverImage: 'https://cdn.test/rel.jpg',
          type: 'TV',
          seasonYear: 2024,
          relationType: 'SEQUEL',
          seriesId: null,
          seasonNumber: null,
        },
      ],
      recommendations: [
        {
          id: 'rec-1',
          slug: 'consigliato',
          title: 'Consigliato',
          titleIta: null,
          coverImage: 'https://cdn.test/rec.jpg',
          type: 'TV',
          status: 'COMPLETED',
          season: null,
          seasonYear: 2023,
          score: 80,
          genres: [],
          availableLanguages: ['SUB_ITA'],
          seriesId: null,
          seasonNumber: null,
        },
      ],
      episodes: [
        {
          id: 'parent-1_e1_SUB_ITA',
          animeId: 'parent-1',
          number: 1,
          title: 'Ep 1',
          titleIta: null,
          thumbnail: null,
          duration: null,
          airDate: null,
          isFiller: false,
          language: 'SUB_ITA',
        },
      ],
    };
    const source = { getAnimeBySlug: async () => detail } as unknown as AnimeSource;
    const service = createCatalogService({ db, source, config, logger: testLogger });

    const first = await service.getBySlug('parent');
    expect(first.relatedAnime).toHaveLength(1);
    expect(first.recommendations).toHaveLength(1);

    // Seconda chiamata: riga fresh con episodi -> percorso DB. Relazioni e consigliati restano.
    const second = await service.getBySlug('parent');
    expect(second.relatedAnime).toHaveLength(1);
    expect(second.relatedAnime[0]).toMatchObject({
      id: 'rel-1',
      slug: 'related-anime',
      relationType: 'SEQUEL',
      coverImage: 'https://cdn.test/rel.jpg',
    });
    expect(second.recommendations).toHaveLength(1);
    expect(second.recommendations[0]).toMatchObject({ id: 'rec-1', slug: 'consigliato' });
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

  it('onSyncComplete viene chiamato col conteggio dopo syncCatalog', async () => {
    const db = createTestDb();
    const config = createConfigService({ db });
    const { source } = countingSource();
    let calledWith: number | null = null;
    const service = createCatalogService({
      db,
      source,
      config,
      logger: testLogger,
      onSyncComplete: (n) => {
        calledWith = n;
      },
    });

    const res = await service.syncCatalog();
    expect(res.synced).toBeGreaterThan(0);
    expect(calledWith).toBe(res.synced);
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

  it('browse filtra per tipo, status, stagione, anno e lingua', async () => {
    const { service } = makeService();
    await service.syncCatalog();

    const movies = await service.browse({ query: '', page: 1, type: 'MOVIE' });
    expect(movies.data.every((a) => a.type === 'MOVIE')).toBe(true);

    const ongoing = await service.browse({ query: '', page: 1, status: 'ONGOING' });
    expect(ongoing.data.every((a) => a.status === 'ONGOING')).toBe(true);

    const spring2022 = await service.browse({
      query: '',
      page: 1,
      season: 'SPRING',
      year: 2022,
    });
    expect(spring2022.data.every((a) => a.season === 'SPRING' && a.seasonYear === 2022)).toBe(true);

    const dub = await service.browse({ query: '', page: 1, language: 'DUB_ITA' });
    expect(dub.data.every((a) => a.availableLanguages.includes('DUB_ITA'))).toBe(true);
  });

  it('browse combina query testuale e genere', async () => {
    const { service } = makeService();
    await service.syncCatalog();

    const genre = (await service.filters()).genres[0];
    if (!genre) {
      throw new Error('nessun genere mock');
    }
    const byGenre = await service.browse({ query: '', page: 1, genre: genre.slug });
    expect(byGenre.data.length).toBeGreaterThan(0);

    const byQuery = await service.browse({ query: 'Jujutsu', page: 1 });
    expect(byQuery.data.some((a) => a.title.toLowerCase().includes('jujutsu'))).toBe(true);
  });

  it('browse ordina per score e title', async () => {
    const { service } = makeService();
    await service.syncCatalog();

    const byScore = await service.browse({ query: '', page: 1, sort: 'score' });
    const scores = byScore.data.map((a) => a.score ?? -1);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));

    const byTitle = await service.browse({ query: '', page: 1, sort: 'title' });
    const titles = byTitle.data.map((a) => a.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
  });

  it('filters restituisce generi e anni dal DB locale', async () => {
    const { service } = makeService();
    await service.syncCatalog();

    const result = await service.filters();

    expect(result.genres.length).toBeGreaterThan(0);
    expect(result.years.length).toBeGreaterThan(0);
    expect(result.years).toEqual([...result.years].sort((a, b) => b - a));
  });
});
