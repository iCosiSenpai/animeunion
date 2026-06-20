import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AnimeSource } from '@animeunion/shared';
import type { EpisodeDetail } from '@animeunion/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../db';
import { createDownloadWorker } from '../lib/download-worker';
import { testLogger } from '../test/helpers';
import type { CatalogService } from './catalog-service';
import { createConfigService } from './config-service';
import { createRenamerService } from './renamer-service';

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

function makeWorker(
  db: ReturnType<typeof import('../test/helpers').createTestDb>,
  catalog: CatalogService,
  config: ReturnType<typeof createConfigService>,
) {
  const renamer = createRenamerService({ db, config });
  return createDownloadWorker({ db, catalog, config, logger: testLogger, renamer });
}

/** Inserisce un anime e un episode_file SUB_ITA per ogni id richiesto (un episodio per file). */
function seedEpisodeFiles(
  db: ReturnType<typeof import('../test/helpers').createTestDb>,
  fileIds: string[],
): void {
  const t = new Date().toISOString();
  db.insert(schema.anime)
    .values({
      id: 'a-1',
      slug: 'foo',
      title: 'Foo',
      titleIta: null,
      type: 'TV',
      status: 'ONGOING',
      coverImage: null,
      episodeCount: fileIds.length,
      createdAt: t,
      updatedAt: t,
    })
    .run();
  fileIds.forEach((fileId, i) => {
    const episodeId = `e-${i + 1}`;
    db.insert(schema.episode)
      .values({
        id: episodeId,
        animeId: 'a-1',
        number: i + 1,
        title: 'Pilot',
        titleIta: null,
        thumbnail: null,
        duration: null,
        airDate: null,
        isFiller: 0,
        languages: 'SUB_ITA',
        createdAt: t,
        updatedAt: t,
      })
      .run();
    db.insert(schema.episodeFile)
      .values({
        id: fileId,
        episodeId,
        language: 'SUB_ITA',
        downloadStatus: 'not_downloaded',
        createdAt: t,
        updatedAt: t,
      })
      .run();
  });
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
    config.set('seriesPathSub', animePath);
    const worker = makeWorker(db, buildStubCatalog(new Map()), config);

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
    config.set('seriesPathSub', animePath);
    const worker = makeWorker(db, buildStubCatalog(new Map()), config);

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
    config.set('seriesPathSub', animePath);
    const worker = makeWorker(db, buildStubCatalog(new Map()), config);

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
    config.set('seriesPathSub', animePath);
    const worker = makeWorker(db, buildStubCatalog(new Map()), config);

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
    config.set('seriesPathSub', animePath);
    const worker = makeWorker(db, buildStubCatalog(new Map()), config);

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
    config.set('seriesPathSub', animePath);
    const worker = makeWorker(db, buildStubCatalog(new Map()), config);
    worker.start();
    worker.start(); // noop
    worker.stop();
    worker.stop(); // noop
  });

  it('pause blocca nuovi job, resume li riabilita', () => {
    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    const worker = makeWorker(db, buildStubCatalog(new Map()), config);

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
        id: 'ef-1',
        episodeId: 'e-1',
        language: 'SUB_ITA',
        downloadStatus: 'not_downloaded',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    worker.start();
    worker.pause();
    expect(worker.isPaused()).toBe(true);

    worker.enqueue('ef-1');
    const queued = db
      .select()
      .from(schema.downloadQueue)
      .where(eq(schema.downloadQueue.episodeFileId, 'ef-1'))
      .get();
    expect(queued?.status).toBe('queued');

    worker.resume();
    expect(worker.isPaused()).toBe(false);
    worker.stop();
  });

  it('enqueue + tryStartNext scarica davvero e completa (regressione path normale)', async () => {
    const body = Buffer.from('fake-mp4-bytes-0123456789');
    const server = createServer((_req, res) => {
      res.writeHead(200, {
        'content-type': 'video/mp4',
        'content-length': String(body.length),
      });
      res.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/ep.mp4`;

    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    const worker = makeWorker(db, buildStubCatalog(new Map([['ef-1', url]])), config);

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
        id: 'ef-1',
        episodeId: 'e-1',
        language: 'SUB_ITA',
        downloadStatus: 'not_downloaded',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    try {
      worker.start();
      const id = worker.enqueue('ef-1');
      await worker.tryStartNext();

      const deadline = Date.now() + 4000;
      let queue = db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.id, id))
        .get();
      while (queue && queue.status !== 'completed' && queue.status !== 'failed') {
        if (Date.now() > deadline) {
          throw new Error(`timeout: stato coda fermo su '${queue.status}'`);
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
        queue = db.select().from(schema.downloadQueue).where(eq(schema.downloadQueue.id, id)).get();
      }

      expect(queue?.status).toBe('completed');
      expect(queue?.progress).toBe(1);

      const epFile = db
        .select()
        .from(schema.episodeFile)
        .where(eq(schema.episodeFile.id, 'ef-1'))
        .get();
      expect(epFile?.downloadStatus).toBe('downloaded');
      expect(epFile?.localPath).toBeTruthy();
      expect(epFile?.fileSize).toBe(body.length);
    } finally {
      worker.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('cancel su downloading orfano (nessun controller in volo) lo segna cancelled', () => {
    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    const worker = makeWorker(db, buildStubCatalog(new Map()), config);

    const t = new Date().toISOString();
    seedEpisodeFiles(db, ['ef-orph']);
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-orph',
        episodeFileId: 'ef-orph',
        status: 'downloading',
        startedAt: t,
        priority: 50,
        createdAt: t,
      })
      .run();

    // Il worker non ha avviato questo job: nessun AbortController in volo -> orfano.
    expect(worker.cancel('q-orph')).toBe(true);
    const row = db
      .select()
      .from(schema.downloadQueue)
      .where(eq(schema.downloadQueue.id, 'q-orph'))
      .get();
    expect(row?.status).toBe('cancelled');
  });

  it('setPriority aggiorna la priorità di un job in coda', () => {
    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    const worker = makeWorker(db, buildStubCatalog(new Map()), config);

    const t = new Date().toISOString();
    seedEpisodeFiles(db, ['ef-p']);
    db.insert(schema.downloadQueue)
      .values({ id: 'q-p', episodeFileId: 'ef-p', status: 'queued', priority: 50, createdAt: t })
      .run();

    expect(worker.setPriority('q-p', 100)).toBe(true);
    const row = db
      .select()
      .from(schema.downloadQueue)
      .where(eq(schema.downloadQueue.id, 'q-p'))
      .get();
    expect(row?.priority).toBe(100);
    expect(worker.setPriority('missing', 100)).toBe(false);
  });

  it('errore permanente (404) fallisce subito senza retry', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<html>link scaduto</html>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/ep.mp4`;

    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    const worker = makeWorker(db, buildStubCatalog(new Map([['ef-1', url]])), config);
    seedEpisodeFiles(db, ['ef-1']);

    try {
      worker.start();
      const id = worker.enqueue('ef-1');
      await worker.tryStartNext();

      const deadline = Date.now() + 4000;
      let q = db.select().from(schema.downloadQueue).where(eq(schema.downloadQueue.id, id)).get();
      while (q && q.status !== 'completed' && q.status !== 'failed') {
        if (Date.now() > deadline) {
          throw new Error(`timeout: stato '${q.status}'`);
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
        q = db.select().from(schema.downloadQueue).where(eq(schema.downloadQueue.id, id)).get();
      }

      expect(q?.status).toBe('failed');
      // Permanente: nessun retry effettuato.
      expect(q?.retryCount).toBe(0);
    } finally {
      worker.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('start reimposta i download orfani (downloading/processing) a failed', () => {
    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    const worker = makeWorker(db, buildStubCatalog(new Map()), config);

    const t = new Date().toISOString();
    seedEpisodeFiles(db, ['ef-a', 'ef-b']);
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-dl',
        episodeFileId: 'ef-a',
        status: 'downloading',
        startedAt: t,
        priority: 50,
        createdAt: t,
      })
      .run();
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-proc',
        episodeFileId: 'ef-b',
        status: 'processing',
        startedAt: t,
        priority: 50,
        createdAt: t,
      })
      .run();

    worker.start();
    try {
      const dl = db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.id, 'q-dl'))
        .get();
      const proc = db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.id, 'q-proc'))
        .get();
      expect(dl?.status).toBe('failed');
      expect(proc?.status).toBe('failed');
    } finally {
      worker.stop();
    }
  });
});
