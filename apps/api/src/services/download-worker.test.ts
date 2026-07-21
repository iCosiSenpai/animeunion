import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
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
import { createFileMutationCoordinator } from './file-mutation-coordinator';
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
  resolveMaxConcurrent?: () => number | Promise<number>,
) {
  const renamer = createRenamerService({ db, config });
  return createDownloadWorker({
    db,
    catalog,
    config,
    logger: testLogger,
    renamer,
    coordinator: createFileMutationCoordinator(),
    resolveMaxConcurrent,
  });
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

  it('cancel su queued è immediato, su completed rifiuta', async () => {
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

    expect(await worker.cancel('q-queued')).toBe(true);
    const queued = db
      .select()
      .from(schema.downloadQueue)
      .all()
      .find((r) => r.id === 'q-queued');
    expect(queued?.status).toBe('cancelled');

    expect(await worker.cancel('q-done')).toBe(false);
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

  it('finalizzazione download attende il coordinatore prima di move e commit DB', async () => {
    const body = mp4('coordinated-finalize');
    const server = createServer((_req, res) => {
      res.writeHead(200, {
        'content-type': 'video/mp4',
        'content-length': String(body.length),
      });
      res.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/episode.mp4`;
    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    seedEpisodeFiles(db, ['ef-coordinated']);
    const coordinator = createFileMutationCoordinator();
    const renamer = createRenamerService({ db, config });
    const worker = createDownloadWorker({
      db,
      catalog: buildStubCatalog(new Map([['ef-coordinated', url]])),
      config,
      logger: testLogger,
      renamer,
      coordinator,
    });
    const finalPath = renamer.computeEpisodePath({
      animeId: 'a-1',
      episodeNumber: 1,
      language: 'SUB_ITA',
    });

    try {
      await worker.start();
      let enter = () => {};
      let release = () => {};
      const entered = new Promise<void>((resolve) => {
        enter = resolve;
      });
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      const blocker = coordinator.runExclusive(async () => {
        enter();
        await released;
      });
      await entered;

      const id = worker.enqueue('ef-coordinated');
      await worker.tryStartNext();
      const deadline = Date.now() + 4000;
      let queue = db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.id, id))
        .get();
      while (queue?.status !== 'processing') {
        if (Date.now() > deadline) {
          throw new Error(`timeout: finalizzazione ferma su '${queue?.status}'`);
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
        queue = db.select().from(schema.downloadQueue).where(eq(schema.downloadQueue.id, id)).get();
      }
      await expect(readFile(finalPath)).rejects.toBeTruthy();
      const beforeRelease = db
        .select()
        .from(schema.episodeFile)
        .where(eq(schema.episodeFile.id, 'ef-coordinated'))
        .get();
      expect(beforeRelease?.downloadStatus).toBe('not_downloaded');

      release();
      await blocker;
      while (queue?.status !== 'completed') {
        if (Date.now() > deadline) {
          throw new Error(`timeout: commit finale fermo su '${queue?.status}'`);
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
        queue = db.select().from(schema.downloadQueue).where(eq(schema.downloadQueue.id, id)).get();
      }
      expect(await readFile(finalPath)).toEqual(body);
      const afterRelease = db
        .select()
        .from(schema.episodeFile)
        .where(eq(schema.episodeFile.id, 'ef-coordinated'))
        .get();
      expect(afterRelease?.downloadStatus).toBe('downloaded');
      expect(afterRelease?.localPath).toBe(finalPath);
    } finally {
      worker.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('cancel durante atomicMove attende finalize e restituisce false', async () => {
    const body = mp4('cancel-during-atomic-move');
    const server = createServer((_req, res) => {
      res.writeHead(200, {
        'content-type': 'video/mp4',
        'content-length': String(body.length),
      });
      res.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/episode.mp4`;
    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    seedEpisodeFiles(db, ['ef-cancel-finalizing']);
    const coordinator = createFileMutationCoordinator();
    const renamer = createRenamerService({ db, config });
    let enterMove = () => {};
    let releaseMove = () => {};
    const moveEntered = new Promise<void>((resolve) => {
      enterMove = resolve;
    });
    const moveReleased = new Promise<void>((resolve) => {
      releaseMove = resolve;
    });
    const worker = createDownloadWorker({
      db,
      catalog: buildStubCatalog(new Map([['ef-cancel-finalizing', url]])),
      config,
      logger: testLogger,
      renamer,
      coordinator,
      atomicMoveImpl: async (from, to) => {
        enterMove();
        await moveReleased;
        await rename(from, to);
      },
    });
    const finalPath = renamer.computeEpisodePath({
      animeId: 'a-1',
      episodeNumber: 1,
      language: 'SUB_ITA',
    });

    try {
      await worker.start();
      const id = worker.enqueue('ef-cancel-finalizing');
      await worker.tryStartNext();
      await moveEntered;

      const cancellation = worker.cancel(id);
      let cancellationSettled = false;
      void cancellation.finally(() => {
        cancellationSettled = true;
      });
      await Promise.resolve();
      expect(cancellationSettled).toBe(false);
      const whileMoving = db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.id, id))
        .get();
      expect(whileMoving?.status).toBe('processing');

      releaseMove();
      expect(await cancellation).toBe(false);
      const completed = db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.id, id))
        .get();
      expect(completed?.status).toBe('completed');
      const file = db
        .select()
        .from(schema.episodeFile)
        .where(eq(schema.episodeFile.id, 'ef-cancel-finalizing'))
        .get();
      expect(file?.downloadStatus).toBe('downloaded');
      expect(await readFile(finalPath)).toEqual(body);
    } finally {
      releaseMove();
      worker.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('cancel durante la verifica non può essere riscritto come processing', async () => {
    const body = mp4('cancel-during-verification');
    const server = createServer((_req, res) => {
      res.writeHead(200, {
        'content-type': 'video/mp4',
        'content-length': String(body.length),
      });
      res.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/episode.mp4`;
    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    config.set('verifyDownloads', true);
    seedEpisodeFiles(db, ['ef-cancel-verifying']);
    const renamer = createRenamerService({ db, config });
    let enterVerify = () => {};
    let releaseVerify = () => {};
    const verifyEntered = new Promise<void>((resolve) => {
      enterVerify = resolve;
    });
    const verifyReleased = new Promise<void>((resolve) => {
      releaseVerify = resolve;
    });
    const worker = createDownloadWorker({
      db,
      catalog: buildStubCatalog(new Map([['ef-cancel-verifying', url]])),
      config,
      logger: testLogger,
      renamer,
      coordinator: createFileMutationCoordinator(),
      verifyVideoFileImpl: async () => {
        enterVerify();
        await verifyReleased;
        return { ok: true };
      },
    });
    const finalPath = renamer.computeEpisodePath({
      animeId: 'a-1',
      episodeNumber: 1,
      language: 'SUB_ITA',
    });

    try {
      await worker.start();
      const id = worker.enqueue('ef-cancel-verifying');
      await worker.tryStartNext();
      await verifyEntered;
      const cancelledEvent = new Promise<void>((resolve) => {
        const listener = ({ queueId }: { queueId: string }) => {
          if (queueId === id) {
            worker.off('cancelled', listener);
            resolve();
          }
        };
        worker.on('cancelled', listener);
      });

      expect(await worker.cancel(id)).toBe(true);
      releaseVerify();
      await cancelledEvent;

      const queue = db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.id, id))
        .get();
      expect(queue?.status).toBe('cancelled');
      const file = db
        .select()
        .from(schema.episodeFile)
        .where(eq(schema.episodeFile.id, 'ef-cancel-verifying'))
        .get();
      expect(file?.downloadStatus).toBe('not_downloaded');
      await expect(readFile(finalPath)).rejects.toBeTruthy();
      await expect(readFile(tempPath(finalPath, id))).rejects.toBeTruthy();
    } finally {
      releaseVerify();
      worker.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
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

  it('cancel su downloading orfano (nessun controller in volo) lo segna cancelled', async () => {
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
    expect(await worker.cancel('q-orph')).toBe(true);
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
      expect(q?.failKind).toBe('permanent');
    } finally {
      worker.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('fallimento ambientale (errno FS) marca fail_kind=env senza retry residui', async () => {
    // Il catalog lancia un errore con code errno di cartella non scrivibile: classifyError → 'env'.
    const catalog = {
      getEpisodeFile: async () => {
        throw Object.assign(new Error('EROFS: read-only file system'), { code: 'EROFS' });
      },
    } as unknown as CatalogService;

    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    const worker = makeWorker(db, catalog, config);
    seedEpisodeFiles(db, ['ef-1']);
    // Ultimo tentativo disponibile (retryCount=2, retryMax=3): fallisce subito in modo terminale.
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-env',
        episodeFileId: 'ef-1',
        status: 'queued',
        retryCount: 2,
        retryMax: 3,
        priority: 50,
        createdAt: new Date().toISOString(),
      })
      .run();

    try {
      worker.start();
      await worker.tryStartNext();

      const deadline = Date.now() + 4000;
      let q = db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.id, 'q-env'))
        .get();
      while (q && q.status !== 'completed' && q.status !== 'failed') {
        if (Date.now() > deadline) {
          throw new Error(`timeout: stato '${q.status}'`);
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
        q = db
          .select()
          .from(schema.downloadQueue)
          .where(eq(schema.downloadQueue.id, 'q-env'))
          .get();
      }

      expect(q?.status).toBe('failed');
      expect(q?.failKind).toBe('env');
    } finally {
      worker.stop();
    }
  });

  it('retryEnvFailed rimette in coda solo i falliti env (permanent/other restano fermi)', () => {
    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    const worker = makeWorker(db, buildStubCatalog(new Map()), config);
    seedEpisodeFiles(db, ['ef-env', 'ef-perm', 'ef-other']);

    const t = new Date().toISOString();
    for (const [id, fileId, failKind] of [
      ['q-env', 'ef-env', 'env'],
      ['q-perm', 'ef-perm', 'permanent'],
      ['q-other', 'ef-other', 'other'],
    ] as const) {
      db.insert(schema.downloadQueue)
        .values({
          id,
          episodeFileId: fileId,
          status: 'failed',
          error: 'boom',
          failKind,
          retryCount: 3,
          retryMax: 3,
          completedAt: t,
          priority: 50,
          createdAt: t,
        })
        .run();
    }

    // Coda ferma (non start) per non far partire davvero i job: verifichiamo solo la transizione DB.
    const resumed = worker.retryEnvFailed();
    expect(resumed).toBe(1);

    const env = db
      .select()
      .from(schema.downloadQueue)
      .where(eq(schema.downloadQueue.id, 'q-env'))
      .get();
    const perm = db
      .select()
      .from(schema.downloadQueue)
      .where(eq(schema.downloadQueue.id, 'q-perm'))
      .get();
    const other = db
      .select()
      .from(schema.downloadQueue)
      .where(eq(schema.downloadQueue.id, 'q-other'))
      .get();
    expect(env?.status).toBe('queued');
    expect(env?.failKind).toBeNull();
    expect(env?.retryCount).toBe(0);
    expect(perm?.status).toBe('failed');
    expect(other?.status).toBe('failed');

    // Idempotente: senza altri env falliti non ripristina nulla.
    expect(worker.retryEnvFailed()).toBe(0);
  });

  it('start reimposta i download orfani (downloading/processing) a failed', async () => {
    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    const coordinator = createFileMutationCoordinator();
    const worker = createDownloadWorker({
      db,
      catalog: buildStubCatalog(new Map()),
      config,
      logger: testLogger,
      renamer: createRenamerService({ db, config }),
      coordinator,
    });

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

    let enter = () => {};
    let release = () => {};
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = coordinator.runExclusive(async () => {
      enter();
      await released;
    });
    await entered;

    const startup = worker.start();
    const beforeRelease = db
      .select()
      .from(schema.downloadQueue)
      .where(eq(schema.downloadQueue.id, 'q-dl'))
      .get();
    expect(beforeRelease?.status).toBe('downloading');
    release();
    await blocker;
    await startup;
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

  it('non avvia queued finché reconcile e sweep non rendono il worker ready', async () => {
    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    const coordinator = createFileMutationCoordinator();
    const worker = createDownloadWorker({
      db,
      catalog: buildStubCatalog(new Map()),
      config,
      logger: testLogger,
      renamer: createRenamerService({ db, config }),
      coordinator,
      resolveMaxConcurrent: async () => 2,
    });
    const t = new Date().toISOString();
    seedEpisodeFiles(db, ['ef-startup-orphan', 'ef-startup-queued']);
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-startup-orphan',
        episodeFileId: 'ef-startup-orphan',
        status: 'processing',
        priority: 50,
        createdAt: t,
      })
      .run();
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-startup-queued',
        episodeFileId: 'ef-startup-queued',
        status: 'queued',
        priority: 50,
        createdAt: t,
      })
      .run();

    let enter = () => {};
    let release = () => {};
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = coordinator.runExclusive(async () => {
      enter();
      await released;
    });
    await entered;

    const startup = worker.start();
    try {
      // Con concorrenza 2 l'orfano occupa un solo slot: senza il gate ready questa chiamata (e il
      // safety tick equivalente) prenoterebbe subito il secondo job mentre reconcile è sospeso.
      await worker.tryStartNext();
      const queuedDuringStartup = db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.id, 'q-startup-queued'))
        .get();
      expect(queuedDuringStartup?.status).toBe('queued');

      worker.pause();
      release();
      await blocker;
      await startup;
      const queuedAfterStartup = db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.id, 'q-startup-queued'))
        .get();
      expect(queuedAfterStartup?.status).toBe('queued');
    } finally {
      release();
      await blocker;
      worker.stop();
    }
  });

  it('invalida un resolver scheduler sospeso attraverso stop e nuovo start', async () => {
    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    const coordinator = createFileMutationCoordinator();
    let blockResolver = false;
    let enterResolver = () => {};
    let releaseResolver = () => {};
    const resolverEntered = new Promise<void>((resolve) => {
      enterResolver = resolve;
    });
    const resolverReleased = new Promise<void>((resolve) => {
      releaseResolver = resolve;
    });
    const worker = createDownloadWorker({
      db,
      catalog: buildStubCatalog(new Map()),
      config,
      logger: testLogger,
      renamer: createRenamerService({ db, config }),
      coordinator,
      resolveMaxConcurrent: async () => {
        if (blockResolver) {
          enterResolver();
          await resolverReleased;
        }
        return 2;
      },
    });

    await worker.start();
    // Drena anche il tryStartNext fire-and-forget avviato al termine dello startup iniziale.
    await worker.tryStartNext();
    const t = new Date().toISOString();
    seedEpisodeFiles(db, ['ef-stale-scheduler-orphan', 'ef-stale-scheduler-queued']);
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-stale-scheduler-orphan',
        episodeFileId: 'ef-stale-scheduler-orphan',
        status: 'processing',
        priority: 50,
        createdAt: t,
      })
      .run();
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-stale-scheduler-queued',
        episodeFileId: 'ef-stale-scheduler-queued',
        status: 'queued',
        priority: 50,
        createdAt: t,
      })
      .run();

    let releaseCoordinator = () => {};
    let blocker: Promise<unknown> = Promise.resolve();
    let restarted: Promise<void> | null = null;
    try {
      blockResolver = true;
      const staleAttempt = worker.tryStartNext();
      await resolverEntered;

      worker.stop();
      let enterCoordinator = () => {};
      const coordinatorEntered = new Promise<void>((resolve) => {
        enterCoordinator = resolve;
      });
      const coordinatorReleased = new Promise<void>((resolve) => {
        releaseCoordinator = resolve;
      });
      blocker = coordinator.runExclusive(async () => {
        enterCoordinator();
        await coordinatorReleased;
      });
      await coordinatorEntered;
      restarted = worker.start();

      releaseResolver();
      await staleAttempt;
      const queuedDuringRestart = db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.id, 'q-stale-scheduler-queued'))
        .get();
      expect(queuedDuringRestart?.status).toBe('queued');

      worker.pause();
      releaseCoordinator();
      await blocker;
      await restarted;
      const queuedAfterRestart = db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.id, 'q-stale-scheduler-queued'))
        .get();
      expect(queuedAfterRestart?.status).toBe('queued');
    } finally {
      releaseResolver();
      releaseCoordinator();
      await blocker;
      await restarted?.catch(() => {});
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
      coordinator: createFileMutationCoordinator(),
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

  it('reconcile rilegge queue e file dopo una mutation autorevole già accodata', async () => {
    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    const renamer = createRenamerService({ db, config });
    const coordinator = createFileMutationCoordinator();
    const worker = createDownloadWorker({
      db,
      catalog: buildStubCatalog(new Map()),
      config,
      logger: testLogger,
      renamer,
      coordinator,
    });

    const t = new Date().toISOString();
    seedEpisodeFiles(db, ['ef-stale-reconcile']);
    const finalPath = renamer.computeEpisodePath({
      animeId: 'a-1',
      episodeNumber: 1,
      language: 'SUB_ITA',
    });
    const body = mp4('stale-reconcile-target');
    await mkdir(dirname(finalPath), { recursive: true });
    await writeFile(finalPath, body);
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-stale-reconcile',
        episodeFileId: 'ef-stale-reconcile',
        status: 'processing',
        targetPath: finalPath,
        expectedBytes: body.length,
        priority: 50,
        createdAt: t,
      })
      .run();

    let enter = () => {};
    let release = () => {};
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = coordinator.runExclusive(async () => {
      enter();
      await released;
    });
    await entered;

    const externalPath = join(animePath, 'external-authoritative.mkv');
    await writeFile(externalPath, 'external-video');
    // Questa mutation entra in coda prima del reconcile, mentre la select candidati vedrà ancora
    // lo snapshot processing/not_downloaded. Cambia solo il file: reconcile deve preservarlo e
    // terminalizzare autonomamente la queue orfana rimasta processing.
    const authoritative = coordinator.runExclusive(async () => {
      db.update(schema.episodeFile)
        .set({
          downloadStatus: 'external',
          localPath: externalPath,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.episodeFile.id, 'ef-stale-reconcile'))
        .run();
    });
    const startup = worker.start();

    try {
      release();
      await blocker;
      await authoritative;
      await startup;

      const queue = db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.id, 'q-stale-reconcile'))
        .get();
      expect(queue?.status).toBe('cancelled');
      expect(queue?.error).toMatch(/stato autorevole external/i);
      const file = db
        .select()
        .from(schema.episodeFile)
        .where(eq(schema.episodeFile.id, 'ef-stale-reconcile'))
        .get();
      expect(file?.downloadStatus).toBe('external');
      expect(file?.localPath).toBe(externalPath);
      expect(await readFile(finalPath)).toEqual(body);
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
      coordinator: createFileMutationCoordinator(),
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

  it('forza 1 download alla volta se non premium (resolveMaxConcurrent di default)', async () => {
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

  it('onora maxConcurrent=3 se premium (resolveMaxConcurrent -> 3)', async () => {
    const sockets: Socket[] = [];
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': '1000000' });
      res.write(Buffer.alloc(64)); // passa lo sniff, poi resta appeso
    });
    server.on('connection', (s) => sockets.push(s));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/ep.mp4`;

    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    config.set('maxConcurrent', 3);

    const urls = new Map([
      ['ef-1', url],
      ['ef-2', url],
      ['ef-3', url],
    ]);
    // Premium: il resolver onora la config (3).
    const worker = makeWorker(db, buildStubCatalog(urls), config, () => 3);
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
      while (downloadingCount() < 3) {
        if (Date.now() > deadline) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const rows = db.select().from(schema.downloadQueue).all();
      expect(rows.filter((r) => r.status === 'downloading')).toHaveLength(3);
      expect(rows.filter((r) => r.status === 'queued')).toHaveLength(0);
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

  it('backoff (A1): un job con retry_at nel futuro non viene ripescato finché non scade', async () => {
    const body = mp4('ok');
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': String(body.length) });
      res.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/ep.mp4`;

    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    const worker = makeWorker(
      db,
      buildStubCatalog(
        new Map([
          ['ef-1', url],
          ['ef-2', url],
        ]),
      ),
      config,
    );
    seedEpisodeFiles(db, ['ef-1', 'ef-2']);

    const t = new Date().toISOString();
    const future = new Date(Date.now() + 3_600_000).toISOString();
    // ef-1 è in backoff (retry_at nel futuro) e sarebbe il più vecchio: senza il gate verrebbe
    // ripescato subito. ef-2 è eleggibile (retry_at nullo).
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-gated',
        episodeFileId: 'ef-1',
        status: 'queued',
        retryAt: future,
        priority: 50,
        createdAt: '2026-01-01T00:00:00.000Z',
      })
      .run();
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-ready',
        episodeFileId: 'ef-2',
        status: 'queued',
        priority: 50,
        createdAt: t,
      })
      .run();

    try {
      worker.start();
      const deadline = Date.now() + 4000;
      let ready = db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.id, 'q-ready'))
        .get();
      while (ready && ready.status !== 'completed' && ready.status !== 'failed') {
        if (Date.now() > deadline) {
          throw new Error(`timeout: q-ready fermo su '${ready.status}'`);
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
        ready = db
          .select()
          .from(schema.downloadQueue)
          .where(eq(schema.downloadQueue.id, 'q-ready'))
          .get();
      }
      expect(ready?.status).toBe('completed');
      // Il finally di runOne ha richiamato tryStartNext, ma q-gated resta bloccato dal backoff.
      const gated = db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.id, 'q-gated'))
        .get();
      expect(gated?.status).toBe('queued');
      expect(gated?.startedAt).toBeNull();
    } finally {
      worker.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('re-enqueue (A2): riattiva una riga terminale invece di restituirla inerte', () => {
    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    const worker = makeWorker(db, buildStubCatalog(new Map()), config);
    // In pausa: la riattivazione non deve avviare un download reale in questo test.
    worker.pause();

    const t = new Date().toISOString();
    seedEpisodeFiles(db, ['ef-1']);
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-cancelled',
        episodeFileId: 'ef-1',
        status: 'cancelled',
        retryCount: 2,
        error: 'annullato',
        completedAt: t,
        priority: 50,
        createdAt: t,
      })
      .run();

    const id = worker.enqueue('ef-1');
    // Riusa la stessa riga (nessun duplicato) e la rimette in coda pulita.
    expect(id).toBe('q-cancelled');
    const rows = db.select().from(schema.downloadQueue).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('queued');
    expect(rows[0]?.retryCount).toBe(0);
    expect(rows[0]?.error).toBeNull();
    expect(rows[0]?.completedAt).toBeNull();
  });
});
