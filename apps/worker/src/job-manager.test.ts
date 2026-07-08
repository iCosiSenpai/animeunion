import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NeuralExportJobPayload } from '@animeunion/shared';
import { describe, expect, it, vi } from 'vitest';
import { createJobManager } from './job-manager';

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as import('./logger').Logger;

const payload: NeuralExportJobPayload = {
  profile: {
    id: 'xq',
    chain: ['a.glsl'],
    targetWidth: 1920,
    targetHeight: 1080,
    videoBitrate: '10M',
    videoCodec: 'libx264',
    audio: 'copy',
    faststart: true,
  },
  shaders: [{ file: 'a.glsl', url: 'https://x/a.glsl', sha256: '0'.repeat(64) }],
};

async function waitForState(
  jobs: ReturnType<typeof createJobManager>,
  id: string,
  timeoutMs = 2000,
): Promise<string> {
  const start = Date.now();
  for (;;) {
    const s = jobs.get(id);
    if (s && (s.state === 'done' || s.state === 'error')) {
      return s.state;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timeout: stato ${s?.state}`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('createJobManager', () => {
  it('esegue la pipeline e va in done, esponendo il result path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wk-jm-'));
    const runUpscaleImpl = vi.fn(async () => ({ ok: true, code: 0, stderr: '' }));
    const jobs = createJobManager({
      ffmpegBin: 'ffmpeg',
      cacheDir: join(dir, 'cache'),
      workDir: dir,
      logger: silentLogger,
      provisionShadersImpl: vi.fn(async () => []),
      buildShaderChainImpl: vi.fn(async (_p, _c, out) => out),
      runUpscaleImpl,
    });
    jobs.create('job1', payload, join(dir, 'job1.src.mp4'));
    expect(await waitForState(jobs, 'job1')).toBe('done');
    expect(jobs.resultPath('job1')).toBe(join(dir, 'job1.out.mp4'));
    expect(runUpscaleImpl).toHaveBeenCalledOnce();
  });

  it('va in error se ffmpeg fallisce, senza result path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wk-jm-'));
    const jobs = createJobManager({
      ffmpegBin: 'ffmpeg',
      cacheDir: join(dir, 'cache'),
      workDir: dir,
      logger: silentLogger,
      provisionShadersImpl: vi.fn(async () => []),
      buildShaderChainImpl: vi.fn(async (_p, _c, out) => out),
      runUpscaleImpl: vi.fn(async () => ({ ok: false, code: 1, stderr: 'boom' })),
    });
    jobs.create('job2', payload, join(dir, 'job2.src.mp4'));
    expect(await waitForState(jobs, 'job2')).toBe('error');
    expect(jobs.resultPath('job2')).toBeNull();
    expect(jobs.get('job2')?.error).toContain('codice 1');
  });

  it('va in error se il provisioning shader lancia (sha256 mismatch)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wk-jm-'));
    const jobs = createJobManager({
      ffmpegBin: 'ffmpeg',
      cacheDir: join(dir, 'cache'),
      workDir: dir,
      logger: silentLogger,
      provisionShadersImpl: vi.fn(async () => {
        throw new Error('sha256 non combacia');
      }),
      runUpscaleImpl: vi.fn(async () => ({ ok: true, code: 0, stderr: '' })),
    });
    jobs.create('job3', payload, join(dir, 'job3.src.mp4'));
    expect(await waitForState(jobs, 'job3')).toBe('error');
    expect(jobs.get('job3')?.error).toContain('sha256');
  });

  it('processa i job in sequenza (concorrenza 1)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wk-jm-'));
    let concurrent = 0;
    let maxConcurrent = 0;
    const jobs = createJobManager({
      ffmpegBin: 'ffmpeg',
      cacheDir: join(dir, 'cache'),
      workDir: dir,
      logger: silentLogger,
      provisionShadersImpl: vi.fn(async () => []),
      buildShaderChainImpl: vi.fn(async (_p, _c, out) => out),
      runUpscaleImpl: vi.fn(async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 20));
        concurrent -= 1;
        return { ok: true, code: 0, stderr: '' };
      }),
    });
    jobs.create('a', payload, join(dir, 'a.src.mp4'));
    jobs.create('b', payload, join(dir, 'b.src.mp4'));
    await waitForState(jobs, 'a');
    await waitForState(jobs, 'b');
    expect(maxConcurrent).toBe(1);
  });
});
