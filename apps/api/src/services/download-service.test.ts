import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../db';
import { createDownloadWorker } from '../lib/download-worker';
import { testLogger } from '../test/helpers';
import type { CatalogService } from './catalog-service';
import { createConfigService } from './config-service';
import { createDownloadService } from './download-service';
import { createRenamerService } from './renamer-service';

function buildStubCatalog(): CatalogService {
  return {} as unknown as CatalogService;
}

function insertAnime(db: ReturnType<typeof import('../test/helpers').createTestDb>, id: string) {
  const ts = new Date().toISOString();
  db.insert(schema.anime)
    .values({
      id,
      slug: id,
      title: id,
      titleIta: null,
      type: 'TV',
      status: 'ONGOING',
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
  status: 'not_downloaded' | 'downloaded' = 'not_downloaded',
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

  function makeService(catalog: CatalogService = buildStubCatalog()) {
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

  it('enqueueForAutoFollows salta se il master autoDownload=false', () => {
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
    const n = service.enqueueForAutoFollows();
    expect(n).toBe(0);
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it('enqueueForAutoFollows rispetta autoDownload per-follow (override dello stato)', () => {
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

    const n = service.enqueueForAutoFollows();
    expect(n).toBe(1);
    expect(enqueueSpy).toHaveBeenCalledWith('ef-2');
    expect(enqueueSpy).not.toHaveBeenCalledWith('ef-1');
  });

  it('enqueueForAutoFollows accoda per watching (default) non per plan_to_watch', () => {
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

    const n = service.enqueueForAutoFollows();
    expect(n).toBe(1);
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
