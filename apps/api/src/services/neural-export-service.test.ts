import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AnimeSource, UserProfile } from '@animeunion/shared';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../db';
import { createMockSource } from '../sources/mock-source';
import { createTestDb, testLogger } from '../test/helpers';
import { createConfigService } from './config-service';
import {
  type FileMutationCoordinator,
  createFileMutationCoordinator,
} from './file-mutation-coordinator';
import {
  type NeuralFetch,
  type NeuralFetchResponse,
  createNeuralExportService,
} from './neural-export-service';
import type { ProfileService } from './profile-service';
import type { RenamerService } from './renamer-service';

const premiumProfile: UserProfile = {
  id: 'u1',
  username: 'tester',
  email: 't@example.com',
  avatarUrl: null,
  role: 'USER',
  createdAt: '2026-01-01T00:00:00.000Z',
  premium: { tier: 'MEGA_FAN', active: true, expiresAt: '2026-12-31T00:00:00.000Z' },
  features: { neuralExport: true },
};

function json(value: unknown, ok = true, status = 200): NeuralFetchResponse {
  return { ok, status, json: async () => value };
}

// Worker fittizio: /health capace, dispatch OK, primo poll -> done.
function makeFetch(over?: { dispatchOk?: boolean }): NeuralFetch {
  return vi.fn(async (url, init) => {
    if (url.endsWith('/health')) {
      return json({
        ok: true,
        ffmpegCapable: true,
        hasLibplacebo: true,
        hasVulkan: true,
        fps: null,
      });
    }
    if (url.endsWith('/jobs') && init?.method === 'POST') {
      if (over?.dispatchOk === false) {
        return json({ error: 'boom' }, false, 502);
      }
      return json({ jobId: 'wjob-1' });
    }
    if (url.endsWith('/jobs/wjob-1')) {
      return json({ id: 'wjob-1', state: 'done', progress: 1, error: null });
    }
    return json({}, false, 404);
  });
}

async function seed(db: ReturnType<typeof createTestDb>, srcPath: string) {
  const ts = '2026-07-08T00:00:00.000Z';
  db.insert(schema.anime)
    .values({
      id: 'a1',
      slug: 'demo',
      title: 'Demo',
      type: 'TV',
      status: 'ONGOING',
      episodeCount: 12,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  db.insert(schema.episode)
    .values({ id: 'e1', animeId: 'a1', number: 3, createdAt: ts, updatedAt: ts })
    .run();
  db.insert(schema.episodeFile)
    .values({
      id: 'ef-sd',
      episodeId: 'e1',
      language: 'SUB_ITA',
      quality: 'SD',
      downloadStatus: 'downloaded',
      localPath: srcPath,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
}

describe('neural-export-service', () => {
  let db: ReturnType<typeof createTestDb>;
  let outDir: string;
  let srcPath: string;
  let config: ReturnType<typeof createConfigService>;

  const entitledProfile: ProfileService = { getMe: async () => premiumProfile };
  const anonProfile: ProfileService = { getMe: async () => null };

  const renamerStub: RenamerService = {
    computeEpisodePath: ({ quality }) =>
      join(outDir, `Demo - S01E03${quality === 'SD' ? '' : ` [${quality}]`}.mp4`),
    previewPath: () => join(outDir, 'preview.mp4'),
  };

  const downloadFileImpl = vi.fn(
    async (_url: string, _headers: Record<string, string>, dest: string) => {
      await writeFile(dest, 'FAKE-UPSCALED-MP4');
    },
  );
  const verifyImpl = vi.fn(async () => ({ ok: true }));

  beforeEach(async () => {
    db = createTestDb();
    outDir = await mkdtemp(join(tmpdir(), 'ne-out-'));
    srcPath = join(await mkdtemp(join(tmpdir(), 'ne-src-')), 'sd.mp4');
    await writeFile(srcPath, 'FAKE-SD-MP4');
    await seed(db, srcPath);
    config = createConfigService({ db });
    config.set('neuralExportEnabled', true);
    config.set('neuralWorkerUrl', 'http://worker.local:8787');
    config.set('neuralWorkerToken', 'shared-token');
    downloadFileImpl.mockClear();
    verifyImpl.mockClear();
  });

  function makeService(opts?: {
    profile?: ProfileService;
    source?: AnimeSource;
    fetchImpl?: NeuralFetch;
    verifyImpl?: typeof verifyImpl;
    coordinator?: FileMutationCoordinator;
  }) {
    return createNeuralExportService({
      db,
      source: opts?.source ?? createMockSource(),
      config,
      profile: opts?.profile ?? entitledProfile,
      renamer: renamerStub,
      logger: testLogger,
      fetchImpl: opts?.fetchImpl ?? makeFetch(),
      downloadFileImpl,
      verifyImpl: opts?.verifyImpl ?? verifyImpl,
      coordinator: opts?.coordinator ?? createFileMutationCoordinator(),
      pollIntervalMs: 1,
      pollTimeoutMs: 60_000,
    });
  }

  it('getStatus: entitled + abilitato + worker capace -> available con profili XQ/XQ+', async () => {
    const svc = makeService();
    const status = await svc.getStatus();
    expect(status.entitled).toBe(true);
    expect(status.available).toBe(true);
    expect(status.worker.reachable).toBe(true);
    expect(status.profiles.map((p) => p.quality).sort()).toEqual(['XQ', 'XQPLUS']);
  });

  it('getStatus: senza entitlement -> non available, niente profili', async () => {
    const svc = makeService({ profile: anonProfile });
    const status = await svc.getStatus();
    expect(status.entitled).toBe(false);
    expect(status.available).toBe(false);
    expect(status.profiles).toHaveLength(0);
  });

  it('exportEpisode: crea una NUOVA riga episode_file XQ senza toccare la sorgente SD', async () => {
    const svc = makeService();
    const { jobId } = await svc.exportEpisode({ episodeFileId: 'ef-sd', quality: 'XQ' });
    await svc.waitForIdle();

    const job = svc.listJobs().find((j) => j.id === jobId);
    expect(job?.state).toBe('done');

    const xq = db
      .select()
      .from(schema.episodeFile)
      .where(and(eq(schema.episodeFile.episodeId, 'e1'), eq(schema.episodeFile.quality, 'XQ')))
      .get();
    expect(xq?.downloadStatus).toBe('downloaded');
    expect(xq?.localPath).toContain('[XQ]');
    expect(await readFile(xq?.localPath as string, 'utf8')).toBe('FAKE-UPSCALED-MP4');

    // La sorgente SD e' intatta.
    const sd = db.select().from(schema.episodeFile).where(eq(schema.episodeFile.id, 'ef-sd')).get();
    expect(sd?.localPath).toBe(srcPath);
    expect(sd?.quality).toBe('SD');
  });

  it('cancel Neural durante il caricamento recipe non resuscita il job queued', async () => {
    const delayedSource = createMockSource();
    const loadRecipe = delayedSource.getNeuralExportProfile.bind(delayedSource);
    let releaseRecipe = () => {};
    const recipeGate = new Promise<void>((resolve) => {
      releaseRecipe = resolve;
    });
    delayedSource.getNeuralExportProfile = async () => {
      await recipeGate;
      return loadRecipe();
    };
    const fetchImpl = makeFetch();
    const svc = makeService({ source: delayedSource, fetchImpl });

    const { jobId } = await svc.exportEpisode({ episodeFileId: 'ef-sd', quality: 'XQ' });
    expect(await svc.cancel(jobId)).toBe(true);
    releaseRecipe();
    await svc.waitForIdle();

    const job = svc.listJobs().find((candidate) => candidate.id === jobId);
    expect(job?.state).toBe('cancelled');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('cancel Neural durante il POST elimina il worker remoto appena ne riceve l ID', async () => {
    let enterDispatch = () => {};
    let releaseDispatch = () => {};
    const dispatchEntered = new Promise<void>((resolve) => {
      enterDispatch = resolve;
    });
    const dispatchGate = new Promise<void>((resolve) => {
      releaseDispatch = resolve;
    });
    const fetchImpl: NeuralFetch = vi.fn(async (url, init) => {
      if (url.endsWith('/jobs') && init?.method === 'POST') {
        enterDispatch();
        await dispatchGate;
        return json({ jobId: 'wjob-late' });
      }
      if (url.endsWith('/jobs/wjob-late') && init?.method === 'DELETE') {
        return json({ ok: true });
      }
      return json({}, false, 404);
    });
    const svc = makeService({ fetchImpl });

    const { jobId } = await svc.exportEpisode({ episodeFileId: 'ef-sd', quality: 'XQ' });
    await dispatchEntered;
    expect(await svc.cancel(jobId)).toBe(true);
    releaseDispatch();
    await svc.waitForIdle();

    const job = svc.listJobs().find((candidate) => candidate.id === jobId);
    expect(job?.state).toBe('cancelled');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://worker.local:8787/jobs/wjob-late',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('finalizzazione Neural attende il coordinatore prima di move e upsert DB', async () => {
    const coordinator = createFileMutationCoordinator();
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

    const svc = makeService({ coordinator });
    await svc.exportEpisode({ episodeFileId: 'ef-sd', quality: 'XQ' });
    await vi.waitFor(() => expect(verifyImpl).toHaveBeenCalled());
    const beforeRelease = db
      .select()
      .from(schema.episodeFile)
      .where(and(eq(schema.episodeFile.episodeId, 'e1'), eq(schema.episodeFile.quality, 'XQ')))
      .get();
    expect(beforeRelease).toBeUndefined();

    release();
    await blocker;
    await svc.waitForIdle();
    const afterRelease = db
      .select()
      .from(schema.episodeFile)
      .where(and(eq(schema.episodeFile.episodeId, 'e1'), eq(schema.episodeFile.quality, 'XQ')))
      .get();
    expect(afterRelease?.downloadStatus).toBe('downloaded');
  });

  it('finalizzazione Neural non sovrascrive una qualità diventata external mentre renderizza', async () => {
    const coordinator = createFileMutationCoordinator();
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

    const externalPath = join(outDir, 'external-xq.mp4');
    await writeFile(externalPath, 'EXTERNAL-XQ');
    const linkExternal = coordinator.runExclusive(async () => {
      const ts = new Date().toISOString();
      db.insert(schema.episodeFile)
        .values({
          id: 'ef-external-xq',
          episodeId: 'e1',
          language: 'SUB_ITA',
          quality: 'XQ',
          downloadStatus: 'external',
          localPath: externalPath,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
    });
    const svc = makeService({ coordinator });
    const { jobId } = await svc.exportEpisode({ episodeFileId: 'ef-sd', quality: 'XQ' });
    await vi.waitFor(() => expect(verifyImpl).toHaveBeenCalled());

    release();
    await blocker;
    await linkExternal;
    await svc.waitForIdle();

    const job = svc.listJobs().find((candidate) => candidate.id === jobId);
    expect(job?.state).toBe('error');
    const xq = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'ef-external-xq'))
      .get();
    expect(xq?.downloadStatus).toBe('external');
    expect(xq?.localPath).toBe(externalPath);
    expect(await readFile(externalPath, 'utf8')).toBe('EXTERNAL-XQ');
  });

  it('finalizzazione Neural non sovrascrive una qualità diventata downloaded mentre renderizza', async () => {
    const coordinator = createFileMutationCoordinator();
    const ts = new Date().toISOString();
    db.insert(schema.episodeFile)
      .values({
        id: 'ef-xq-placeholder',
        episodeId: 'e1',
        language: 'SUB_ITA',
        quality: 'XQ',
        downloadStatus: 'not_downloaded',
        createdAt: ts,
        updatedAt: ts,
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

    const linkedPath = join(outDir, 'linked-xq.mp4');
    await writeFile(linkedPath, 'LINKED-XQ');
    const relink = coordinator.runExclusive(async () => {
      db.update(schema.episodeFile)
        .set({
          downloadStatus: 'downloaded',
          localPath: linkedPath,
          fileSize: 9,
          downloadedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.episodeFile.id, 'ef-xq-placeholder'))
        .run();
    });
    const svc = makeService({ coordinator });
    const { jobId } = await svc.exportEpisode({ episodeFileId: 'ef-sd', quality: 'XQ' });
    await vi.waitFor(() => expect(verifyImpl).toHaveBeenCalled());

    release();
    await blocker;
    await relink;
    await svc.waitForIdle();

    const job = svc.listJobs().find((candidate) => candidate.id === jobId);
    expect(job?.state).toBe('error');
    expect(job?.error).toMatch(/downloaded/i);
    const xq = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'ef-xq-placeholder'))
      .get();
    expect(xq?.downloadStatus).toBe('downloaded');
    expect(xq?.localPath).toBe(linkedPath);
    expect(await readFile(linkedPath, 'utf8')).toBe('LINKED-XQ');
  });

  it('finalizzazione Neural rispetta un annullamento accodato prima del proprio lock', async () => {
    const coordinator = createFileMutationCoordinator();
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

    const svc = makeService({ coordinator });
    const { jobId } = await svc.exportEpisode({ episodeFileId: 'ef-sd', quality: 'XQ' });
    // cancel acquisisce la posizione in coda prima che download/verifica arrivino a finalize.
    const cancelled = svc.cancel(jobId);
    await vi.waitFor(() => expect(verifyImpl).toHaveBeenCalled());

    release();
    await blocker;
    expect(await cancelled).toBe(true);
    await svc.waitForIdle();

    const job = svc.listJobs().find((candidate) => candidate.id === jobId);
    expect(job?.state).toBe('cancelled');
    const xq = db
      .select()
      .from(schema.episodeFile)
      .where(and(eq(schema.episodeFile.episodeId, 'e1'), eq(schema.episodeFile.quality, 'XQ')))
      .get();
    expect(xq).toBeUndefined();
  });

  it('finalizzazione Neural non ricrea output se la sorgente viene eliminata durante il render', async () => {
    const coordinator = createFileMutationCoordinator();
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

    // La cancellazione è già in coda quando finalize proverà ad acquisire il coordinatore, ma il
    // render può ancora leggere la sorgente finché il blocker resta attivo.
    const deleteSource = coordinator.runExclusive(async () => {
      await rm(srcPath, { force: true });
      db.update(schema.episodeFile)
        .set({
          downloadStatus: 'not_downloaded',
          localPath: null,
          fileSize: null,
          downloadedAt: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.episodeFile.id, 'ef-sd'))
        .run();
    });
    const svc = makeService({ coordinator });
    const { jobId } = await svc.exportEpisode({ episodeFileId: 'ef-sd', quality: 'XQ' });
    await vi.waitFor(() => expect(verifyImpl).toHaveBeenCalled());

    release();
    await blocker;
    await deleteSource;
    await svc.waitForIdle();

    const job = svc.listJobs().find((candidate) => candidate.id === jobId);
    expect(job?.state).toBe('error');
    expect(job?.error).toMatch(/sorgente|modificat/i);
    const xq = db
      .select()
      .from(schema.episodeFile)
      .where(and(eq(schema.episodeFile.episodeId, 'e1'), eq(schema.episodeFile.quality, 'XQ')))
      .get();
    expect(xq).toBeUndefined();
    const finalPath = renamerStub.computeEpisodePath({
      animeId: 'a1',
      episodeNumber: 3,
      language: 'SUB_ITA',
      quality: 'XQ',
    });
    await expect(readFile(finalPath)).rejects.toBeTruthy();
    await expect(readFile(srcPath)).rejects.toBeTruthy();
  });

  it('finalizzazione Neural rifiuta un ABA della sorgente allo stesso path', async () => {
    const coordinator = createFileMutationCoordinator();
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

    // Ripristina intenzionalmente gli stessi marker DB e la stessa lunghezza: la protezione deve
    // riconoscere l'oggetto filesystem nuovo, non soltanto path/status/timestamp applicativo.
    const replacement = 'REAL-SD-MP4';
    const replaceSource = coordinator.runExclusive(async () => {
      await rm(srcPath, { force: true });
      await writeFile(srcPath, replacement);
      db.update(schema.episodeFile)
        .set({
          downloadStatus: 'downloaded',
          localPath: srcPath,
          fileSize: null,
          downloadedAt: null,
          updatedAt: '2026-07-08T00:00:00.000Z',
        })
        .where(eq(schema.episodeFile.id, 'ef-sd'))
        .run();
    });
    const svc = makeService({ coordinator });
    const { jobId } = await svc.exportEpisode({ episodeFileId: 'ef-sd', quality: 'XQ' });
    await vi.waitFor(() => expect(verifyImpl).toHaveBeenCalled());

    release();
    await blocker;
    await replaceSource;
    await svc.waitForIdle();

    const job = svc.listJobs().find((candidate) => candidate.id === jobId);
    expect(job?.state).toBe('error');
    expect(job?.error).toMatch(/generazione|sorgente|modificat/i);
    const xq = db
      .select()
      .from(schema.episodeFile)
      .where(and(eq(schema.episodeFile.episodeId, 'e1'), eq(schema.episodeFile.quality, 'XQ')))
      .get();
    expect(xq).toBeUndefined();
    expect(await readFile(srcPath, 'utf8')).toBe(replacement);
    const finalPath = renamerStub.computeEpisodePath({
      animeId: 'a1',
      episodeNumber: 3,
      language: 'SUB_ITA',
      quality: 'XQ',
    });
    await expect(readFile(finalPath)).rejects.toBeTruthy();
  });

  it('exportEpisode: senza entitlement -> PreconditionError, nessun job', async () => {
    const svc = makeService({ profile: anonProfile });
    await expect(svc.exportEpisode({ episodeFileId: 'ef-sd', quality: 'XQ' })).rejects.toThrow(
      /piano/i,
    );
    expect(svc.listJobs()).toHaveLength(0);
  });

  it('worker giu al dispatch -> job in error, nessuna riga XQ, SD intatta', async () => {
    const svc = makeService({ fetchImpl: makeFetch({ dispatchOk: false }) });
    const { jobId } = await svc.exportEpisode({ episodeFileId: 'ef-sd', quality: 'XQ' });
    await svc.waitForIdle();

    const job = svc.listJobs().find((j) => j.id === jobId);
    expect(job?.state).toBe('error');

    const xq = db
      .select()
      .from(schema.episodeFile)
      .where(and(eq(schema.episodeFile.episodeId, 'e1'), eq(schema.episodeFile.quality, 'XQ')))
      .get();
    expect(xq).toBeUndefined();
    const sd = db.select().from(schema.episodeFile).where(eq(schema.episodeFile.id, 'ef-sd')).get();
    expect(sd?.downloadStatus).toBe('downloaded');
  });

  it('output upscalato corrotto (verifica KO) -> job error, nessuna XQ, SD intatta', async () => {
    const svc = makeService({
      verifyImpl: vi.fn(async () => ({ ok: false, reason: 'output non riproducibile' })),
    });
    const { jobId } = await svc.exportEpisode({ episodeFileId: 'ef-sd', quality: 'XQ' });
    await svc.waitForIdle();

    const job = svc.listJobs().find((j) => j.id === jobId);
    expect(job?.state).toBe('error');
    expect(job?.error ?? '').toMatch(/integrit/i);

    const xq = db
      .select()
      .from(schema.episodeFile)
      .where(and(eq(schema.episodeFile.episodeId, 'e1'), eq(schema.episodeFile.quality, 'XQ')))
      .get();
    expect(xq).toBeUndefined();
    const sd = db.select().from(schema.episodeFile).where(eq(schema.episodeFile.id, 'ef-sd')).get();
    expect(sd?.downloadStatus).toBe('downloaded');
    expect(sd?.localPath).toBe(srcPath);
  });

  it('idempotenza: chiamare export due volte riusa lo stesso job attivo', async () => {
    // fetch che non completa mai (stato running) per mantenere il job attivo.
    const pendingFetch: NeuralFetch = vi.fn(async (url, init) => {
      if (url.endsWith('/jobs') && init?.method === 'POST') {
        return json({ jobId: 'wjob-1' });
      }
      if (url.endsWith('/jobs/wjob-1')) {
        return json({ id: 'wjob-1', state: 'running', progress: 0.2, error: null });
      }
      return json({}, false, 404);
    });
    const svc = makeService({ fetchImpl: pendingFetch });
    const first = await svc.exportEpisode({ episodeFileId: 'ef-sd', quality: 'XQ' });
    const second = await svc.exportEpisode({ episodeFileId: 'ef-sd', quality: 'XQ' });
    expect(second.jobId).toBe(first.jobId);
    await svc.cancel(first.jobId);
    await svc.waitForIdle();
  });
});
