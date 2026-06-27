import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../db';
import { createDownloadWorker } from '../lib/download-worker';
import { testLogger } from '../test/helpers';
import type { CatalogService } from './catalog-service';
import { createConfigService } from './config-service';
import { createDownloadService } from './download-service';
import { createRenamerService } from './renamer-service';

function buildStubCatalog(): CatalogService {
  return { getBySlug: vi.fn().mockResolvedValue(undefined) } as unknown as CatalogService;
}

function insertAnime(
  db: ReturnType<typeof import('../test/helpers').createTestDb>,
  id: string,
  status: 'ONGOING' | 'COMPLETED' | 'UPCOMING' = 'ONGOING',
) {
  const ts = new Date().toISOString();
  db.insert(schema.anime)
    .values({
      id,
      slug: id,
      title: id,
      titleIta: null,
      type: 'TV',
      status,
      coverImage: null,
      episodeCount: 2,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
}

function insertEpisode(
  db: ReturnType<typeof import('../test/helpers').createTestDb>,
  id: string,
  animeId: string,
  number: number,
) {
  const ts = new Date().toISOString();
  db.insert(schema.episode)
    .values({
      id,
      animeId,
      number,
      title: `Ep ${number}`,
      titleIta: null,
      thumbnail: null,
      duration: null,
      airDate: null,
      isFiller: 0,
      languages: 'SUB_ITA',
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
}

function insertFile(
  db: ReturnType<typeof import('../test/helpers').createTestDb>,
  id: string,
  episodeId: string,
  language: 'SUB_ITA' | 'DUB_ITA',
  status: 'not_downloaded' | 'downloaded' | 'external' = 'not_downloaded',
) {
  const ts = new Date().toISOString();
  db.insert(schema.episodeFile)
    .values({
      id,
      episodeId,
      language,
      downloadStatus: status,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
}

function insertQueue(
  db: ReturnType<typeof import('../test/helpers').createTestDb>,
  id: string,
  episodeFileId: string,
  status: 'queued' | 'downloading' | 'processing' | 'completed' | 'failed' | 'cancelled',
) {
  db.insert(schema.downloadQueue)
    .values({
      id,
      episodeFileId,
      status,
      priority: 50,
      progress: 0,
      createdAt: new Date().toISOString(),
    })
    .run();
}

describe('DownloadService', () => {
  let db: ReturnType<typeof import('../test/helpers').createTestDb>;
  let animePath: string;
  let enqueueSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    db = (await import('../test/helpers')).createTestDb();
    animePath = await mkdtemp(join(tmpdir(), 'au-svc-'));
    enqueueSpy = vi.fn();
  });
  afterEach(async () => {
    await rm(animePath, { recursive: true, force: true });
  });

  function makeService(
    catalog: CatalogService = buildStubCatalog(),
    onAutoEnqueued?: (animeId: string, count: number) => void,
  ) {
    const config = createConfigService({ db });
    config.set('seriesPathSub', animePath);
    config.set('autoDownload', true);
    const renamer = createRenamerService({ db, config });
    const realWorker = createDownloadWorker({
      db,
      catalog,
      config,
      logger: testLogger,
      renamer,
    });
    const worker = { ...realWorker, enqueue: enqueueSpy };
    const service = createDownloadService({
      db,
      worker: worker as never,
      catalog,
      config,
      logger: testLogger,
      onAutoEnqueued,
    });
    service.start();
    return { service, config };
  }

  it('addEpisode accoda e ritorna un id', () => {
    const { service } = makeService();
    insertAnime(db, 'a-1');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA');
    enqueueSpy.mockReturnValue('q-123');

    const id = service.addEpisode({ episodeFileId: 'ef-1' });
    expect(id).toBe('q-123');
    expect(enqueueSpy).toHaveBeenCalledWith('ef-1', undefined);
  });

  it('addEpisode lancia se le cartelle non sono configurate', () => {
    const { service, config } = makeService();
    config.set('seriesPathSub', '');
    insertAnime(db, 'a-1');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA');

    expect(() => service.addEpisode({ episodeFileId: 'ef-1' })).toThrow(/Configura le cartelle/);
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it('addEpisode idempotente: ritorna id esistente se già in coda', () => {
    const { service } = makeService();
    insertAnime(db, 'a-1');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA');
    const ts = new Date().toISOString();
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-existing',
        episodeFileId: 'ef-1',
        status: 'queued',
        priority: 50,
        createdAt: ts,
      })
      .run();

    const id = service.addEpisode({ episodeFileId: 'ef-1' });
    expect(id).toBe('q-existing');
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it('addMissing salta downloaded e già in coda, accoda il resto', () => {
    const { service } = makeService();
    insertAnime(db, 'a-1');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertEpisode(db, 'e-2', 'a-1', 2);
    insertEpisode(db, 'e-3', 'a-1', 3);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA', 'downloaded'); // salta
    insertFile(db, 'ef-2', 'e-2', 'SUB_ITA', 'not_downloaded'); // accoda
    insertFile(db, 'ef-3', 'e-3', 'SUB_ITA', 'not_downloaded'); // accoda
    const ts = new Date().toISOString();
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-already',
        episodeFileId: 'ef-3',
        status: 'queued',
        priority: 50,
        createdAt: ts,
      })
      .run();

    const n = service.addMissing({ animeId: 'a-1' });
    expect(n).toBe(1);
    expect(enqueueSpy).toHaveBeenCalledWith('ef-2');
  });

  it('addMissing salta i file external (collegati senza scaricare)', () => {
    const { service } = makeService();
    insertAnime(db, 'a-1');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertEpisode(db, 'e-2', 'a-1', 2);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA', 'external'); // gia presente: non si ri-scarica
    insertFile(db, 'ef-2', 'e-2', 'SUB_ITA', 'not_downloaded'); // accoda

    const n = service.addMissing({ animeId: 'a-1' });
    expect(n).toBe(1);
    expect(enqueueSpy).toHaveBeenCalledWith('ef-2');
    expect(enqueueSpy).not.toHaveBeenCalledWith('ef-1');
  });

  it('addMissing con filtro lingua', () => {
    const { service } = makeService();
    insertAnime(db, 'a-1');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertEpisode(db, 'e-2', 'a-1', 2);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA', 'not_downloaded');
    insertFile(db, 'ef-2', 'e-2', 'DUB_ITA', 'not_downloaded');

    const n = service.addMissing({ animeId: 'a-1', language: 'SUB_ITA' });
    expect(n).toBe(1);
    expect(enqueueSpy).toHaveBeenCalledWith('ef-1');
  });

  it('getQueue ritorna item denormalizzati con anime/episode', () => {
    const { service } = makeService();
    insertAnime(db, 'a-1');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA');
    const ts = new Date().toISOString();
    db.insert(schema.downloadQueue)
      .values({ id: 'q-1', episodeFileId: 'ef-1', status: 'queued', priority: 50, createdAt: ts })
      .run();

    const q = service.getQueue();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({
      id: 'q-1',
      episodeFileId: 'ef-1',
      status: 'queued',
      progress: 0,
      animeId: 'a-1',
      animeSlug: 'a-1',
      animeTitle: 'a-1',
      episodeId: 'e-1',
      episodeNumber: 1,
      language: 'SUB_ITA',
    });
  });

  it('cancel delega al worker e ritorna il risultato', () => {
    const { service } = makeService();
    expect(service.cancel('q-nonexistent')).toBe(false);
  });

  it('clearCompleted rimuove solo gli status terminali', () => {
    const { service } = makeService();
    insertAnime(db, 'a-1');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertEpisode(db, 'e-2', 'a-1', 2);
    insertEpisode(db, 'e-3', 'a-1', 3);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA');
    insertFile(db, 'ef-2', 'e-2', 'DUB_ITA');
    insertFile(db, 'ef-3', 'e-3', 'SUB_ITA');
    const ts = new Date().toISOString();
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-completed',
        episodeFileId: 'ef-1',
        status: 'completed',
        priority: 50,
        createdAt: ts,
      })
      .run();
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-failed',
        episodeFileId: 'ef-2',
        status: 'failed',
        priority: 50,
        createdAt: ts,
      })
      .run();
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-queued',
        episodeFileId: 'ef-3',
        status: 'queued',
        priority: 50,
        createdAt: ts,
      })
      .run();

    const removed = service.clearCompleted();
    expect(removed).toBe(2);
    const remaining = db.select().from(schema.downloadQueue).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe('q-queued');
  });

  it('purgeOldTerminal rimuove solo i terminali più vecchi della retention', () => {
    const { service, config } = makeService();
    config.set('queueRetentionDays', 7);
    insertAnime(db, 'a-1');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertEpisode(db, 'e-2', 'a-1', 2);
    insertEpisode(db, 'e-3', 'a-1', 3);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA');
    insertFile(db, 'ef-2', 'e-2', 'SUB_ITA');
    insertFile(db, 'ef-3', 'e-3', 'SUB_ITA');
    const old = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    const recent = new Date().toISOString();
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-old',
        episodeFileId: 'ef-1',
        status: 'completed',
        completedAt: old,
        priority: 50,
        createdAt: old,
      })
      .run();
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-new',
        episodeFileId: 'ef-2',
        status: 'completed',
        completedAt: recent,
        priority: 50,
        createdAt: recent,
      })
      .run();
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-queued',
        episodeFileId: 'ef-3',
        status: 'queued',
        priority: 50,
        createdAt: old,
      })
      .run();

    expect(service.purgeOldTerminal()).toBe(1);
    const ids = db
      .select()
      .from(schema.downloadQueue)
      .all()
      .map((r) => r.id)
      .sort();
    expect(ids).toEqual(['q-new', 'q-queued']);
  });

  it('enqueueForAutoFollows salta se il master autoDownload=false', async () => {
    const { service, config } = makeService();
    config.set('autoDownload', false);
    insertAnime(db, 'a-1');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA');
    db.insert(schema.follow)
      .values({
        id: 'f-1',
        animeId: 'a-1',
        status: 'watching',
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastCheckAt: null,
        notes: null,
      })
      .run();
    const n = await service.enqueueForAutoFollows();
    expect(n).toBe(0);
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it('enqueueForAutoFollows rispetta autoDownload per-follow (override dello stato)', async () => {
    const { service } = makeService();
    insertAnime(db, 'a-1');
    insertAnime(db, 'a-2');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertEpisode(db, 'e-2', 'a-2', 1);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA');
    insertFile(db, 'ef-2', 'e-2', 'SUB_ITA');
    const ts = new Date().toISOString();
    // watching ma auto-download disattivato esplicitamente → NON accoda.
    db.insert(schema.follow)
      .values({
        id: 'f-1',
        animeId: 'a-1',
        status: 'watching',
        autoDownload: 0,
        addedAt: ts,
        updatedAt: ts,
        lastCheckAt: null,
        notes: null,
      })
      .run();
    // plan_to_watch ma auto-download attivato esplicitamente → accoda.
    db.insert(schema.follow)
      .values({
        id: 'f-2',
        animeId: 'a-2',
        status: 'plan_to_watch',
        autoDownload: 1,
        addedAt: ts,
        updatedAt: ts,
        lastCheckAt: null,
        notes: null,
      })
      .run();

    const n = await service.enqueueForAutoFollows();
    expect(n).toBe(1);
    expect(enqueueSpy).toHaveBeenCalledWith('ef-2');
    expect(enqueueSpy).not.toHaveBeenCalledWith('ef-1');
  });

  it('enqueueForAutoFollows accoda per watching (default) non per plan_to_watch', async () => {
    const { service } = makeService();
    insertAnime(db, 'a-1');
    insertAnime(db, 'a-2');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertEpisode(db, 'e-2', 'a-2', 1);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA');
    insertFile(db, 'ef-2', 'e-2', 'SUB_ITA');
    const ts = new Date().toISOString();
    db.insert(schema.follow)
      .values({
        id: 'f-1',
        animeId: 'a-1',
        status: 'watching',
        addedAt: ts,
        updatedAt: ts,
        lastCheckAt: null,
        notes: null,
      })
      .run();
    db.insert(schema.follow)
      .values({
        id: 'f-2',
        animeId: 'a-2',
        status: 'plan_to_watch',
        addedAt: ts,
        updatedAt: ts,
        lastCheckAt: null,
        notes: null,
      })
      .run();

    const n = await service.enqueueForAutoFollows();
    expect(n).toBe(1);
    expect(enqueueSpy).toHaveBeenCalledWith('ef-1');
  });

  it('enqueueForAutoFollows esclude gli anime COMPLETED (niente refresh né accodamento)', async () => {
    const getBySlug = vi.fn().mockResolvedValue(undefined);
    const catalog = { getBySlug } as unknown as CatalogService;
    const { service } = makeService(catalog);
    insertAnime(db, 'a-1', 'COMPLETED');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA');
    db.insert(schema.follow)
      .values({
        id: 'f-1',
        animeId: 'a-1',
        status: 'watching',
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastCheckAt: null,
        notes: null,
      })
      .run();

    const n = await service.enqueueForAutoFollows();
    expect(n).toBe(0);
    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(getBySlug).not.toHaveBeenCalled();
  });

  it('enqueueForAutoFollows rinfresca gli ONGOING e accoda i nuovi episodi', async () => {
    const getBySlug = vi.fn().mockResolvedValue({ id: 'a-1' });
    const catalog = { getBySlug } as unknown as CatalogService;
    const onAutoEnqueued = vi.fn();
    const { service } = makeService(catalog, onAutoEnqueued);
    insertAnime(db, 'a-1', 'ONGOING');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA');
    db.insert(schema.follow)
      .values({
        id: 'f-1',
        animeId: 'a-1',
        status: 'watching',
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastCheckAt: null,
        notes: null,
      })
      .run();

    const n = await service.enqueueForAutoFollows();
    expect(n).toBe(1);
    expect(getBySlug).toHaveBeenCalledWith('a-1', { forceRefresh: true });
    expect(enqueueSpy).toHaveBeenCalledWith('ef-1');
    expect(onAutoEnqueued).toHaveBeenCalledWith('a-1', 1);
  });

  it("enqueueForAutoFollows: autoDownload=1 non basta se l'anime è COMPLETED", async () => {
    const getBySlug = vi.fn().mockResolvedValue(undefined);
    const catalog = { getBySlug } as unknown as CatalogService;
    const { service } = makeService(catalog);
    insertAnime(db, 'a-1', 'COMPLETED');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA');
    db.insert(schema.follow)
      .values({
        id: 'f-1',
        animeId: 'a-1',
        status: 'plan_to_watch',
        autoDownload: 1,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastCheckAt: null,
        notes: null,
      })
      .run();

    const n = await service.enqueueForAutoFollows();
    expect(n).toBe(0);
    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(getBySlug).not.toHaveBeenCalled();
  });

  it('enqueueForAutoFollows: refresh best-effort, accoda dalla cache se getBySlug fallisce', async () => {
    const getBySlug = vi.fn().mockRejectedValue(new Error('offline'));
    const catalog = { getBySlug } as unknown as CatalogService;
    const { service } = makeService(catalog);
    insertAnime(db, 'a-1', 'ONGOING');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA');
    db.insert(schema.follow)
      .values({
        id: 'f-1',
        animeId: 'a-1',
        status: 'watching',
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastCheckAt: null,
        notes: null,
      })
      .run();

    const n = await service.enqueueForAutoFollows();
    expect(n).toBe(1);
    expect(getBySlug).toHaveBeenCalledWith('a-1', { forceRefresh: true });
    expect(enqueueSpy).toHaveBeenCalledWith('ef-1');
  });

  it('pauseQueue/resumeQueue controllano lo stato della coda', () => {
    const { service } = makeService();
    expect(service.isQueuePaused()).toBe(false);
    service.pauseQueue();
    expect(service.isQueuePaused()).toBe(true);
    service.resumeQueue();
    expect(service.isQueuePaused()).toBe(false);
  });

  it('cancelAll annulla solo i job in coda', () => {
    const { service } = makeService();
    insertAnime(db, 'a-1');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertEpisode(db, 'e-2', 'a-1', 2);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA');
    insertFile(db, 'ef-2', 'e-2', 'SUB_ITA');
    const ts = new Date().toISOString();
    db.insert(schema.downloadQueue)
      .values({ id: 'q-1', episodeFileId: 'ef-1', status: 'queued', priority: 50, createdAt: ts })
      .run();
    db.insert(schema.downloadQueue)
      .values({ id: 'q-2', episodeFileId: 'ef-2', status: 'queued', priority: 50, createdAt: ts })
      .run();

    const n = service.cancelAll();
    expect(n).toBe(2);
  });

  it('retryAllFailed rimette in coda solo i job falliti', () => {
    const { service } = makeService();
    insertAnime(db, 'a-1');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA');
    const ts = new Date().toISOString();
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-1',
        episodeFileId: 'ef-1',
        status: 'failed',
        priority: 50,
        retryCount: 3,
        retryMax: 3,
        createdAt: ts,
      })
      .run();

    const n = service.retryAllFailed();
    expect(n).toBe(1);
  });

  it('addEpisodeByRef risolve slug+numero+lingua e accoda', async () => {
    const catalog = {
      getBySlug: vi.fn(async () => ({ id: 'a-1' })),
    } as unknown as CatalogService;
    const { service } = makeService(catalog);
    insertAnime(db, 'a-1');
    insertEpisode(db, 'e-1', 'a-1', 12);
    insertFile(db, 'ef-1', 'e-1', 'DUB_ITA');
    enqueueSpy.mockReturnValue('q-ref');

    const id = await service.addEpisodeByRef({
      slug: 'koori',
      episodeNumber: 12,
      language: 'DUB_ITA',
    });
    expect(id).toBe('q-ref');
    expect(catalog.getBySlug).toHaveBeenCalledWith('koori');
    expect(enqueueSpy).toHaveBeenCalledWith('ef-1', undefined);
  });

  it('addAllBySlug risolve lo slug, mette in cache e accoda i mancanti', async () => {
    const catalog = {
      getBySlug: vi.fn(async () => ({ id: 'a-1' })),
    } as unknown as CatalogService;
    const { service } = makeService(catalog);
    insertAnime(db, 'a-1');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertEpisode(db, 'e-2', 'a-1', 2);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA', 'downloaded'); // salta
    insertFile(db, 'ef-2', 'e-2', 'SUB_ITA', 'not_downloaded'); // accoda

    const n = await service.addAllBySlug({ slug: 'naruto' });
    expect(catalog.getBySlug).toHaveBeenCalledWith('naruto');
    expect(n).toBe(1);
    expect(enqueueSpy).toHaveBeenCalledWith('ef-2');
  });

  it('getQueueSummary aggrega i conteggi e mette solo gli in volo in activeItems', () => {
    const { service } = makeService();
    insertAnime(db, 'a-1');
    for (let i = 1; i <= 7; i += 1) {
      insertEpisode(db, `e-${i}`, 'a-1', i);
      insertFile(db, `ef-${i}`, `e-${i}`, 'SUB_ITA');
    }
    insertQueue(db, 'q-1', 'ef-1', 'downloading');
    insertQueue(db, 'q-2', 'ef-2', 'queued');
    insertQueue(db, 'q-3', 'ef-3', 'queued');
    insertQueue(db, 'q-4', 'ef-4', 'queued');
    insertQueue(db, 'q-5', 'ef-5', 'completed');
    insertQueue(db, 'q-6', 'ef-6', 'completed');
    insertQueue(db, 'q-7', 'ef-7', 'failed');

    const { groups, counts } = service.getQueueSummary();
    expect(counts).toEqual({
      all: 7,
      queued: 3,
      downloading: 1,
      processing: 0,
      completed: 2,
      failed: 1,
      cancelled: 0,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      animeId: 'a-1',
      total: 7,
      queued: 3,
      downloading: 1,
      completed: 2,
      failed: 1,
    });
    expect(groups[0]?.activeItems).toHaveLength(1);
    expect(groups[0]?.activeItems[0]?.status).toBe('downloading');
  });

  it('getQueueSummary ordina i gruppi con download in corso per primi', () => {
    const { service } = makeService();
    insertAnime(db, 'a-anime');
    insertAnime(db, 'z-anime');
    insertEpisode(db, 'e-a', 'a-anime', 1);
    insertFile(db, 'ef-a', 'e-a', 'SUB_ITA');
    insertEpisode(db, 'e-z', 'z-anime', 1);
    insertFile(db, 'ef-z', 'e-z', 'SUB_ITA');
    insertQueue(db, 'q-a', 'ef-a', 'queued');
    insertQueue(db, 'q-z', 'ef-z', 'downloading');

    const { groups } = service.getQueueSummary();
    // z-anime ha un download in corso → precede a-anime nonostante l'ordine alfabetico.
    expect(groups.map((g) => g.animeId)).toEqual(['z-anime', 'a-anime']);
  });

  it('getQueueGroupItems pagina e ordina per numero episodio', () => {
    const { service } = makeService();
    insertAnime(db, 'a-1');
    // Inserisce in ordine sparso per verificare l'ordinamento per episode.number.
    for (const n of [3, 1, 5, 2, 4]) {
      insertEpisode(db, `e-${n}`, 'a-1', n);
      insertFile(db, `ef-${n}`, `e-${n}`, 'SUB_ITA');
      insertQueue(db, `q-${n}`, `ef-${n}`, 'queued');
    }

    const p0 = service.getQueueGroupItems({ animeId: 'a-1', filter: 'all', limit: 2, offset: 0 });
    expect(p0.total).toBe(5);
    expect(p0.items.map((i) => i.episodeNumber)).toEqual([1, 2]);
    const p1 = service.getQueueGroupItems({ animeId: 'a-1', filter: 'all', limit: 2, offset: 2 });
    expect(p1.items.map((i) => i.episodeNumber)).toEqual([3, 4]);
    const p2 = service.getQueueGroupItems({ animeId: 'a-1', filter: 'all', limit: 2, offset: 4 });
    expect(p2.items.map((i) => i.episodeNumber)).toEqual([5]);
  });

  it('getQueueGroupItems filtra per stato', () => {
    const { service } = makeService();
    insertAnime(db, 'a-1');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertEpisode(db, 'e-2', 'a-1', 2);
    insertEpisode(db, 'e-3', 'a-1', 3);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA');
    insertFile(db, 'ef-2', 'e-2', 'SUB_ITA');
    insertFile(db, 'ef-3', 'e-3', 'SUB_ITA');
    insertQueue(db, 'q-1', 'ef-1', 'completed');
    insertQueue(db, 'q-2', 'ef-2', 'queued');
    insertQueue(db, 'q-3', 'ef-3', 'failed');

    const done = service.getQueueGroupItems({
      animeId: 'a-1',
      filter: 'completed',
      limit: 50,
      offset: 0,
    });
    expect(done.total).toBe(1);
    expect(done.items[0]?.status).toBe('completed');
    const active = service.getQueueGroupItems({
      animeId: 'a-1',
      filter: 'active',
      limit: 50,
      offset: 0,
    });
    expect(active.total).toBe(1);
    expect(active.items[0]?.status).toBe('queued');
  });

  it('cancelGroup annulla solo i job del gruppo richiesto', () => {
    const { service } = makeService();
    insertAnime(db, 'a-1');
    insertAnime(db, 'a-2');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertEpisode(db, 'e-2', 'a-1', 2);
    insertEpisode(db, 'e-3', 'a-2', 1);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA');
    insertFile(db, 'ef-2', 'e-2', 'SUB_ITA');
    insertFile(db, 'ef-3', 'e-3', 'SUB_ITA');
    insertQueue(db, 'q-1', 'ef-1', 'queued');
    insertQueue(db, 'q-2', 'ef-2', 'queued');
    insertQueue(db, 'q-3', 'ef-3', 'queued');

    const n = service.cancelGroup('a-1');
    expect(n).toBe(2);
    const rows = db.select().from(schema.downloadQueue).all();
    expect(rows.find((r) => r.id === 'q-3')?.status).toBe('queued');
  });

  it('retryGroup rimette in coda solo i falliti del gruppo richiesto', () => {
    const { service } = makeService();
    insertAnime(db, 'a-1');
    insertAnime(db, 'a-2');
    insertEpisode(db, 'e-1', 'a-1', 1);
    insertEpisode(db, 'e-2', 'a-2', 1);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA');
    insertFile(db, 'ef-2', 'e-2', 'SUB_ITA');
    insertQueue(db, 'q-1', 'ef-1', 'failed');
    insertQueue(db, 'q-2', 'ef-2', 'failed');

    // Esattamente 1 job rimesso in coda (solo a-1); a-2 resta fallito (il worker.retry avvia il job
    // ricodato, quindi non asseriamo lo stato finale di q-1: basta il conteggio + lo scoping).
    const n = service.retryGroup('a-1');
    expect(n).toBe(1);
    const rows = db.select().from(schema.downloadQueue).all();
    expect(rows.find((r) => r.id === 'q-2')?.status).toBe('failed');
  });

  it('la migrazione 0013 crea idx_download_episode_file (risalita per le azioni di gruppo)', () => {
    const names = db
      .all<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'download_queue'`,
      )
      .map((r) => r.name);
    expect(names).toContain('idx_download_episode_file');
  });

  it('addEpisodeByRef lancia NOT_FOUND se la lingua non esiste', async () => {
    const catalog = {
      getBySlug: vi.fn(async () => ({ id: 'a-1' })),
    } as unknown as CatalogService;
    const { service } = makeService(catalog);
    insertAnime(db, 'a-1');
    insertEpisode(db, 'e-1', 'a-1', 12);
    insertFile(db, 'ef-1', 'e-1', 'SUB_ITA'); // esiste solo SUB

    await expect(
      service.addEpisodeByRef({ slug: 'koori', episodeNumber: 12, language: 'DUB_ITA' }),
    ).rejects.toThrow(/non disponibile/);
    expect(enqueueSpy).not.toHaveBeenCalled();
  });
});
