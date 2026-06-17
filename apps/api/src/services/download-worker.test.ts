import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AnimeSource } from '@animeunion/shared';
import type { EpisodeDetail } from '@animeunion/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../db';
import { createDownloadWorker } from '../lib/download-worker';
import { testLogger } from '../test/helpers';
import type { CatalogService } from './catalog-service';
import { createConfigService } from './config-service';

function buildStubCatalog(urlByFileId: Map<string, string | null>): CatalogService {
  return {
    getEpisodeFile: async (episodeFileId: string) => {
      const url = urlByFileId.get(episodeFileId) ?? 'https://example.com/fake.mp4';
      return {
        id: episodeFileId,
        animeId: 'a-1',
        number: 1,
        title: 'Pilot',
        titleIta: null,
        duration: null,
        thumbnail: null,
        airDate: null,
        isFiller: false,
        language: 'SUB_ITA',
        downloadUrl: url,
        expiresAt: null,
      } satisfies EpisodeDetail;
    },
  } as unknown as CatalogService;
}

function buildMockSource(): AnimeSource {
  return {} as AnimeSource;
}

describe('DownloadWorker (FSM)', () => {
  let db: ReturnType<typeof import('../test/helpers').createTestDb>;
  let animePath: string;

  beforeEach(async () => {
    db = (await import('../test/helpers')).createTestDb();
    animePath = await mkdtemp(join(tmpdir(), 'au-worker-'));
  });
  afterEach(async () => {
    await rm(animePath, { recursive: true, force: true });
  });

  it('enqueue inserisce in coda e ritorna queueId', () => {
    const config = createConfigService({ db });
    config.set('animePath', animePath);
    const worker = createDownloadWorker({
      db,
      catalog: buildStubCatalog(new Map()),
      config,
      logger: testLogger,
    });

    // Setup minimale: anime + episode + episode_file
    db.insert(schema.anime)
      .values({
        id: 'a-1',
        slug: 'foo',
        title: 'Foo',
        titleIta: null,
        type: 'TV',
        status: 'ONGOING',
        coverImage: null,
        episodeCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();
    db.insert(schema.episode)
      .values({
        id: 'e-1',
        animeId: 'a-1',
        number: 1,
        title: 'Pilot',
        titleIta: null,
        thumbnail: null,
        duration: null,
        airDate: null,
        isFiller: 0,
        languages: 'SUB_ITA',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();
    db.insert(schema.episodeFile)
      .values({
        id: 'ef-1',
        episodeId: 'e-1',
        language: 'SUB_ITA',
        downloadStatus: 'not_downloaded',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();

    const id = worker.enqueue('ef-1');
    expect(id).toMatch(/[0-9a-f-]{36}/);
    const rows = db.select().from(schema.downloadQueue).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.episodeFileId).toBe('ef-1');
    expect(rows[0]?.status).toBe('queued');
  });

  it('enqueue idempotente: due chiamate per stesso episodeFileId ritornano lo stesso id', () => {
    const config = createConfigService({ db });
    config.set('animePath', animePath);
    const worker = createDownloadWorker({
      db,
      catalog: buildStubCatalog(new Map()),
      config,
      logger: testLogger,
    });

    db.insert(schema.anime)
      .values({
        id: 'a-1',
        slug: 'foo',
        title: 'Foo',
        titleIta: null,
        type: 'TV',
        status: 'ONGOING',
        coverImage: null,
        episodeCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();
    db.insert(schema.episode)
      .values({
        id: 'e-1',
        animeId: 'a-1',
        number: 1,
        title: 'Pilot',
        titleIta: null,
        thumbnail: null,
        duration: null,
        airDate: null,
        isFiller: 0,
        languages: 'SUB_ITA',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();
    db.insert(schema.episodeFile)
      .values({
        id: 'ef-1',
        episodeId: 'e-1',
        language: 'SUB_ITA',
        downloadStatus: 'not_downloaded',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();

    const a = worker.enqueue('ef-1');
    const b = worker.enqueue('ef-1');
    expect(a).toBe(b);
  });

  it('cancel su queued è immediato, su completed rifiuta', () => {
    const config = createConfigService({ db });
    config.set('animePath', animePath);
    const worker = createDownloadWorker({
      db,
      catalog: buildStubCatalog(new Map()),
      config,
      logger: testLogger,
    });

    const timestamp = new Date().toISOString();
    db.insert(schema.anime)
      .values({
        id: 'a-1',
        slug: 'foo',
        title: 'Foo',
        titleIta: null,
        type: 'TV',
        status: 'ONGOING',
        coverImage: null,
        episodeCount: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    db.insert(schema.episode)
      .values({
        id: 'e-1',
        animeId: 'a-1',
        number: 1,
        title: 'Pilot',
        titleIta: null,
        thumbnail: null,
        duration: null,
        airDate: null,
        isFiller: 0,
        languages: 'SUB_ITA',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    db.insert(schema.episodeFile)
      .values({
        id: 'ef-x',
        episodeId: 'e-1',
        language: 'SUB_ITA',
        downloadStatus: 'not_downloaded',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    db.insert(schema.episodeFile)
      .values({
        id: 'ef-y',
        episodeId: 'e-1',
        language: 'DUB_ITA',
        downloadStatus: 'not_downloaded',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-queued',
        episodeFileId: 'ef-x',
        status: 'queued',
        priority: 50,
        createdAt: timestamp,
      })
      .run();
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-done',
        episodeFileId: 'ef-y',
        status: 'completed',
        priority: 50,
        createdAt: timestamp,
      })
      .run();

    expect(worker.cancel('q-queued')).toBe(true);
    const queued = db
      .select()
      .from(schema.downloadQueue)
      .all()
      .find((r) => r.id === 'q-queued');
    expect(queued?.status).toBe('cancelled');

    expect(worker.cancel('q-done')).toBe(false);
  });

  it('retry su failed rimette in coda e resetta retry_count', () => {
    const config = createConfigService({ db });
    config.set('animePath', animePath);
    const worker = createDownloadWorker({
      db,
      catalog: buildStubCatalog(new Map()),
      config,
      logger: testLogger,
    });

    const timestamp = new Date().toISOString();
    db.insert(schema.anime)
      .values({
        id: 'a-1',
        slug: 'foo',
        title: 'Foo',
        titleIta: null,
        type: 'TV',
        status: 'ONGOING',
        coverImage: null,
        episodeCount: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    db.insert(schema.episode)
      .values({
        id: 'e-1',
        animeId: 'a-1',
        number: 1,
        title: 'Pilot',
        titleIta: null,
        thumbnail: null,
        duration: null,
        airDate: null,
        isFiller: 0,
        languages: 'SUB_ITA',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    db.insert(schema.episodeFile)
      .values({
        id: 'ef-z',
        episodeId: 'e-1',
        language: 'SUB_ITA',
        downloadStatus: 'not_downloaded',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-fail',
        episodeFileId: 'ef-z',
        status: 'failed',
        retryCount: 3,
        retryMax: 3,
        error: 'HTTP 500',
        priority: 50,
        createdAt: timestamp,
      })
      .run();

    expect(worker.retry('q-fail')).toBe(true);
    const row = db
      .select()
      .from(schema.downloadQueue)
      .all()
      .find((r) => r.id === 'q-fail');
    expect(row?.status).toBe('queued');
    expect(row?.retryCount).toBe(0);
    expect(row?.error).toBeNull();
  });

  it('retry su non-failed rifiuta', () => {
    const config = createConfigService({ db });
    config.set('animePath', animePath);
    const worker = createDownloadWorker({
      db,
      catalog: buildStubCatalog(new Map()),
      config,
      logger: testLogger,
    });

    const timestamp = new Date().toISOString();
    db.insert(schema.anime)
      .values({
        id: 'a-1',
        slug: 'foo',
        title: 'Foo',
        titleIta: null,
        type: 'TV',
        status: 'ONGOING',
        coverImage: null,
        episodeCount: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    db.insert(schema.episode)
      .values({
        id: 'e-1',
        animeId: 'a-1',
        number: 1,
        title: 'Pilot',
        titleIta: null,
        thumbnail: null,
        duration: null,
        airDate: null,
        isFiller: 0,
        languages: 'SUB_ITA',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    db.insert(schema.episodeFile)
      .values({
        id: 'ef-k',
        episodeId: 'e-1',
        language: 'SUB_ITA',
        downloadStatus: 'not_downloaded',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-ok',
        episodeFileId: 'ef-k',
        status: 'completed',
        priority: 50,
        createdAt: timestamp,
      })
      .run();

    expect(worker.retry('q-ok')).toBe(false);
  });

  it('start + stop sono idempotenti', () => {
    const config = createConfigService({ db });
    config.set('animePath', animePath);
    const worker = createDownloadWorker({
      db,
      catalog: buildStubCatalog(new Map()),
      config,
      logger: testLogger,
    });
    worker.start();
    worker.start(); // noop
    worker.stop();
    worker.stop(); // noop
  });
});
