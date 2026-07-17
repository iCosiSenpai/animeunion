import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { UserProfile } from '@animeunion/shared';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../db';
import { createConfigService } from '../services/config-service';
import { createMockSource } from '../sources/mock-source';
import { createTestDb, testLogger } from '../test/helpers';
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
    fetchImpl?: NeuralFetch;
    verifyImpl?: typeof verifyImpl;
  }) {
    return createNeuralExportService({
      db,
      source: createMockSource(),
      config,
      profile: opts?.profile ?? entitledProfile,
      renamer: renamerStub,
      logger: testLogger,
      fetchImpl: opts?.fetchImpl ?? makeFetch(),
      downloadFileImpl,
      verifyImpl: opts?.verifyImpl ?? verifyImpl,
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
