import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkerApp } from './app';
import { logger } from './logger';

const caps = {
  ffmpegCapable: true,
  hasLibplacebo: true,
  hasVulkan: true,
  fps: null,
};

async function makeApp() {
  const dir = await mkdtemp(join(tmpdir(), 'wk-app-'));
  const app = await createWorkerApp({
    token: 'secret',
    ffmpegBin: 'ffmpeg',
    cacheDir: join(dir, 'cache'),
    workDir: join(dir, 'work'),
    logger,
    probeImpl: vi.fn(async () => caps),
  });
  return app;
}

describe('worker app auth', () => {
  const apps: Awaited<ReturnType<typeof createWorkerApp>>[] = [];
  afterEach(async () => {
    for (const a of apps.splice(0)) {
      await a.close();
    }
  });

  it('rifiuta senza token (401)', async () => {
    const app = await makeApp();
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(401);
  });

  it('rifiuta con token errato (401)', async () => {
    const app = await makeApp();
    apps.push(app);
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { authorization: 'Bearer wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('/health con token ok ritorna le capacita', async () => {
    const app = await makeApp();
    apps.push(app);
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { authorization: 'Bearer secret' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.hasLibplacebo).toBe(true);
  });

  it('job inesistente ritorna 404', async () => {
    const app = await makeApp();
    apps.push(app);
    const res = await app.inject({
      method: 'GET',
      url: '/jobs/nope',
      headers: { authorization: 'Bearer secret' },
    });
    expect(res.statusCode).toBe(404);
  });
});
