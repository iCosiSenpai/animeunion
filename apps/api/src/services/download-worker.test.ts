import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AnimeSource } from '@animeunion/shared';
import type { EpisodeDetail } from '@animeunion/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../db';
import { tempPath } from '../lib/download-fs';
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

// Buffer "video" finto con firma MP4 (size + 'ftyp' ai byte 4-7), così supera lo sniff del
// downloader (che rifiuta i contenuti testuali senza firma video).
function mp4(payload: Buffer | string = 'video-bytes'): Buffer {
  const header = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
  return Buffer.concat([header, typeof payload === 'string' ? Buffer.from(payload) : payload]);
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

/** Catalog stub a due serie (a-1 con 3 file, a-2 con 1) per i test di fairness. */
function twoSeriesCatalog(url: string): CatalogService {
  const animeByFile: Record<string, string> = {
    'a1-e1': 'a-1',
    'a1-e2': 'a-1',
    'a1-e3': 'a-1',
    'a2-e1': 'a-2',
  };
  return {
    getEpisodeFile: async (fileId: string) => ({
      id: fileId,
      animeId: animeByFile[fileId] ?? 'a-1',
      number: 1,
      title: 'P',
      titleIta: null,
      duration: null,
      thumbnail: null,
      airDate: null,
      isFiller: false,
      language: 'SUB_ITA',
      downloadUrl: url,
      expiresAt: null,
    }),
  } as unknown as CatalogService;
}

/**
 * Seed di due serie con coda: a-1 (3 episodi, createdAt più vecchio) e a-2 (1 episodio, più recente).
 * `priorities` permette di alzare la priorità di singoli job per i test "Scarica prima".
 */
function seedTwoSeriesQueue(
  db: ReturnType<typeof import('../test/helpers').createTestDb>,
  opts: { priorities?: Record<string, number> } = {},
): void {
  const t = '2026-01-01T00:00:00.000Z';
  for (const [id, slug, count] of [
    ['a-1', 'foo', 3],
    ['a-2', 'bar', 1],
  ] as const) {
    db.insert(schema.anime)
      .values({
        id,
        slug,
        title: slug,
        type: 'TV',
        status: 'ONGOING',
        episodeCount: count,
        createdAt: t,
        updatedAt: t,
      })
      .run();
  }
  const rows: Array<[string, string, string, number, string]> = [
    ['a1-e1', 'e-a1-1', 'a-1', 1, '2026-01-01T00:00:01.000Z'],
    ['a1-e2', 'e-a1-2', 'a-1', 2, '2026-01-01T00:00:02.000Z'],
    ['a1-e3', 'e-a1-3', 'a-1', 3, '2026-01-01T00:00:03.000Z'],
    ['a2-e1', 'e-a2-1', 'a-2', 1, '2026-01-01T00:00:04.000Z'],
  ];
  for (const [fid, eid, aid, num, cAt] of rows) {
    db.insert(schema.episode)
      .values({ id: eid, animeId: aid, number: num, createdAt: t, updatedAt: t })
      .run();
    db.insert(schema.episodeFile)
      .values({
        id: fid,
        episodeId: eid,
        language: 'SUB_ITA',
        downloadStatus: 'not_downloaded',
        createdAt: t,
        updatedAt: t,
      })
      .run();
    db.insert(schema.downloadQueue)
      .values({
        id: `q-${fid}`,
        episodeFileId: fid,
        status: 'queued',
        priority: opts.priorities?.[fid] ?? 50,
        createdAt: cAt,
      })
      .run();
  }
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
    const body = mp4('fake-mp4-bytes-0123456789');
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

  it('start: self-healing di un orfano col file già al target (crash dopo il rename)', async () => {
    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    const renamer = createRenamerService({ db, config });
    const worker = createDownloadWorker({
      db,
      catalog: buildStubCatalog(new Map()),
      config,
      logger: testLogger,
      renamer,
    });

    const t = new Date().toISOString();
    seedEpisodeFiles(db, ['ef-heal']);
    // Simula il crash tra il rename atomico (file già al target) e il commit DB: la riga è
    // rimasta 'processing' con target_path/expected_bytes valorizzati.
    const finalPath = renamer.computeEpisodePath({
      animeId: 'a-1',
      episodeNumber: 1,
      language: 'SUB_ITA',
    });
    const body = mp4('already-on-disk');
    await mkdir(dirname(finalPath), { recursive: true });
    await writeFile(finalPath, body);
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-heal',
        episodeFileId: 'ef-heal',
        status: 'processing',
        targetPath: finalPath,
        expectedBytes: body.length,
        priority: 50,
        createdAt: t,
      })
      .run();

    worker.start();
    try {
      const deadline = Date.now() + 3000;
      let q = db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.id, 'q-heal'))
        .get();
      while (q && q.status === 'processing') {
        if (Date.now() > deadline) {
          throw new Error('timeout: reconcileOrphans non ha finalizzato');
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
        q = db
          .select()
          .from(schema.downloadQueue)
          .where(eq(schema.downloadQueue.id, 'q-heal'))
          .get();
      }
      expect(q?.status).toBe('completed');
      const ef = db
        .select()
        .from(schema.episodeFile)
        .where(eq(schema.episodeFile.id, 'ef-heal'))
        .get();
      expect(ef?.downloadStatus).toBe('downloaded');
      expect(ef?.localPath).toBe(finalPath);
      expect(ef?.fileSize).toBe(body.length);
    } finally {
      worker.stop();
    }
  });

  it('resume sicuro: URL cambiato → scarta il .part stantio e riscarica corretto', async () => {
    const body = mp4('fresh-and-correct-content');
    // Server che onora il Range (206): se il worker riprendesse il .part stantio otterrebbe un
    // file corrotto. Col fix l'URL diverso fa scartare il .part → niente Range → 200 completo.
    const server = createServer((req, res) => {
      const range = req.headers.range;
      if (typeof range === 'string') {
        const off = Number(/bytes=(\d+)-/.exec(range)?.[1] ?? '0');
        res.writeHead(206, {
          'content-type': 'video/mp4',
          'content-range': `bytes ${off}-${body.length - 1}/${body.length}`,
          'content-length': String(body.length - off),
        });
        res.end(body.subarray(off));
      } else {
        res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': String(body.length) });
        res.end(body);
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/ep.mp4`;

    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    const renamer = createRenamerService({ db, config });
    const worker = createDownloadWorker({
      db,
      catalog: buildStubCatalog(new Map([['ef-1', url]])),
      config,
      logger: testLogger,
      renamer,
    });

    const t = new Date().toISOString();
    seedEpisodeFiles(db, ['ef-1']);
    const finalPath = renamer.computeEpisodePath({
      animeId: 'a-1',
      episodeNumber: 1,
      language: 'SUB_ITA',
    });
    const partial = tempPath(finalPath, 'q-stale');
    await mkdir(dirname(finalPath), { recursive: true });
    await writeFile(partial, Buffer.from('XXXXXXXXXXXXXXXX')); // byte stantii non appartenenti a body
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-stale',
        episodeFileId: 'ef-1',
        status: 'queued',
        sourceUrl: 'http://expired.example/old.mp4', // diverso dall'URL ri-risolto
        priority: 50,
        createdAt: t,
      })
      .run();

    try {
      worker.start();
      const deadline = Date.now() + 4000;
      let q = db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.id, 'q-stale'))
        .get();
      while (q && q.status !== 'completed' && q.status !== 'failed') {
        if (Date.now() > deadline) {
          throw new Error(`timeout: stato '${q.status}'`);
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
        q = db
          .select()
          .from(schema.downloadQueue)
          .where(eq(schema.downloadQueue.id, 'q-stale'))
          .get();
      }
      expect(q?.status).toBe('completed');
      const ef = db
        .select()
        .from(schema.episodeFile)
        .where(eq(schema.episodeFile.id, 'ef-1'))
        .get();
      expect(ef?.fileSize).toBe(body.length); // niente concatenazione coi byte stantii
      const written = await readFile(finalPath);
      expect(written.equals(body)).toBe(true);
    } finally {
      worker.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('forza 1 download alla volta anche con maxConcurrent=3 (Premium futuro)', async () => {
    // Server che accetta la richiesta ma non completa mai la risposta: il primo job
    // resta 'downloading' cosi' possiamo osservare che gli altri due restano 'queued'.
    const sockets: Socket[] = [];
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': '1000000' });
      res.write(Buffer.alloc(64)); // qualche byte (passa lo sniff), poi blocca senza end()
    });
    server.on('connection', (s) => sockets.push(s));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/ep.mp4`;

    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    config.set('maxConcurrent', 3); // anche se l'utente lo alza, il worker impone 1

    const urls = new Map([
      ['ef-1', url],
      ['ef-2', url],
      ['ef-3', url],
    ]);
    const worker = makeWorker(db, buildStubCatalog(urls), config);
    seedEpisodeFiles(db, ['ef-1', 'ef-2', 'ef-3']);

    try {
      worker.start();
      worker.enqueue('ef-1');
      worker.enqueue('ef-2');
      worker.enqueue('ef-3');
      await worker.tryStartNext();

      const downloadingCount = () =>
        db
          .select()
          .from(schema.downloadQueue)
          .all()
          .filter((r) => r.status === 'downloading').length;

      const deadline = Date.now() + 4000;
      while (downloadingCount() === 0) {
        if (Date.now() > deadline) {
          throw new Error('nessun download avviato');
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      // Concedi tempo a un eventuale secondo job di partire: NON deve.
      await new Promise((resolve) => setTimeout(resolve, 150));

      const rows = db.select().from(schema.downloadQueue).all();
      expect(rows.filter((r) => r.status === 'downloading')).toHaveLength(1);
      expect(rows.filter((r) => r.status === 'queued')).toHaveLength(2);
    } finally {
      worker.stop();
      for (const s of sockets) {
        s.destroy();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('round-robin: una seconda serie non resta dietro tutta la coda della prima', async () => {
    const body = mp4('xy');
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': String(body.length) });
      res.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/ep.mp4`;

    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    const worker = makeWorker(db, twoSeriesCatalog(url), config);
    seedTwoSeriesQueue(db);

    const completed: string[] = [];
    worker.on('complete', ({ episodeFileId }) => completed.push(episodeFileId));

    try {
      worker.start();
      await worker.tryStartNext();
      const deadline = Date.now() + 6000;
      while (completed.length < 4) {
        if (Date.now() > deadline) {
          throw new Error(`timeout: completati ${completed.length}/4`);
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      // Senza fairness l'ordine sarebbe a1-e1, a1-e2, a1-e3, a2-e1.
      // Con il round-robin la serie B (a-2) viene servita al 2° giro, non dopo tutta la serie A.
      expect(completed[0]).toBe('a1-e1');
      expect(completed[1]).toBe('a2-e1');
    } finally {
      worker.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('la priorità (Scarica prima) batte la fairness', async () => {
    const body = mp4('xy');
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': String(body.length) });
      res.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/ep.mp4`;

    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    const worker = makeWorker(db, twoSeriesCatalog(url), config);
    // a1-e3 ha priorità alta: deve essere servito per primo, scavalcando anche a1-e1 più vecchio.
    seedTwoSeriesQueue(db, { priorities: { 'a1-e3': 100 } });

    const completed: string[] = [];
    worker.on('complete', ({ episodeFileId }) => completed.push(episodeFileId));

    try {
      worker.start();
      await worker.tryStartNext();
      const deadline = Date.now() + 6000;
      while (completed.length < 4) {
        if (Date.now() > deadline) {
          throw new Error(`timeout: completati ${completed.length}/4`);
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      // Il job prioritario salta in cima; poi la fairness fa servire la serie B.
      expect(completed[0]).toBe('a1-e3');
      expect(completed[1]).toBe('a2-e1');
    } finally {
      worker.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
