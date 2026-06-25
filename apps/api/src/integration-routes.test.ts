import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { integrationRoutes } from './integration-routes';
import { createCatalogService } from './services/catalog-service';
import { createConfigService } from './services/config-service';
import { createDownloadService } from './services/download-service';
import { createFollowService } from './services/follow-service';
import { createRequestAuthService } from './services/request-auth-service';
import { createRequestService } from './services/request-service';
import { createSeriesResolver } from './services/series-resolver';
import { createMockSource } from './sources/mock-source';
import { createTestDb, testLogger } from './test/helpers';
import type { Context } from './trpc';

function buildCtx(opts: { downloadConfigured?: boolean } = {}) {
  const db = createTestDb();
  const source = createMockSource();
  const config = createConfigService({ db });
  if (opts.downloadConfigured !== false) {
    // Cartella isolata/inesistente: configura i download senza toccare il filesystem reale.
    config.set('seriesPathSub', join(tmpdir(), `au-req-${Math.random().toString(36).slice(2)}`));
  }
  const catalog = createCatalogService({ db, source, config, logger: testLogger });
  const follow = createFollowService({ db, source, logger: testLogger });
  const resolver = createSeriesResolver({ db });
  const download = createDownloadService({
    db,
    worker: {
      enqueue: vi.fn().mockReturnValue('q-test-1'),
      cancel: vi.fn().mockReturnValue(false),
      retry: vi.fn().mockReturnValue(false),
      start: vi.fn(),
      stop: vi.fn(),
    } as never,
    catalog,
    config,
    logger: testLogger,
  });
  const requestAuth = createRequestAuthService({ db });
  const requests = createRequestService({ catalog, resolver, follow, download, config });
  const ctx = {
    db,
    services: { requestAuth, requests, follow, download, catalog, config },
    logger: testLogger,
  } as unknown as Context;
  return { ctx, follow, requestAuth };
}

async function makeApp(opts: { withKey?: boolean; downloadConfigured?: boolean } = {}) {
  const { ctx, follow, requestAuth } = buildCtx({ downloadConfigured: opts.downloadConfigured });
  const key = opts.withKey === false ? '' : requestAuth.generateKey().key;
  const app = fastify();
  await app.register(integrationRoutes(ctx), { prefix: '/api/integration' });
  return { app, key, follow };
}

function post(app: ReturnType<typeof fastify>, body: unknown, key?: string) {
  return app.inject({
    method: 'POST',
    url: '/api/integration/requests',
    headers: {
      'content-type': 'application/json',
      ...(key ? { 'x-api-key': key } : {}),
    },
    payload: JSON.stringify(body),
  });
}

describe('integration routes /api/integration/requests', () => {
  it('senza X-Api-Key risponde 401', async () => {
    const { app } = await makeApp();
    const res = await post(app, { slug: 'jujutsu-kaisen' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('con X-Api-Key errata risponde 401', async () => {
    const { app } = await makeApp();
    const res = await post(app, { slug: 'jujutsu-kaisen' }, 'auk_sbagliata');
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('se nessuna chiave e configurata, risponde 401 anche con un header', async () => {
    const { app } = await makeApp({ withKey: false });
    const res = await post(app, { slug: 'jujutsu-kaisen' }, 'auk_qualsiasi');
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('con chiave valida ma body vuoto risponde 400', async () => {
    const { app, key } = await makeApp();
    const res = await post(app, {}, key);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_request');
    await app.close();
  });

  it("per slug valido: segue l'anime e accoda gli episodi (200)", async () => {
    const { app, key, follow } = await makeApp();
    const res = await post(app, { slug: 'jujutsu-kaisen' }, key);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.slug).toBe('jujutsu-kaisen');
    expect(body.status).toBe('followed');
    expect(body.enqueued).toBeGreaterThan(0);
    expect(follow.list()).toHaveLength(1);
    await app.close();
  });

  it('richiesta ripetuta: status "already" e nessun follow duplicato', async () => {
    const { app, key, follow } = await makeApp();
    await post(app, { slug: 'jujutsu-kaisen' }, key);
    const res = await post(app, { slug: 'jujutsu-kaisen' }, key);

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('already');
    expect(follow.list()).toHaveLength(1);
    await app.close();
  });

  it('download:false segue soltanto, enqueued 0', async () => {
    const { app, key, follow } = await makeApp();
    const res = await post(app, { slug: 'jujutsu-kaisen', download: false }, key);

    expect(res.statusCode).toBe(200);
    expect(res.json().enqueued).toBe(0);
    expect(follow.list()).toHaveLength(1);
    await app.close();
  });

  it('slug inesistente risponde 404', async () => {
    const { app, key } = await makeApp();
    const res = await post(app, { slug: 'non-esiste' }, key);
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('download richiesto ma cartelle non configurate risponde 412', async () => {
    const { app, key, follow } = await makeApp({ downloadConfigured: false });
    const res = await post(app, { slug: 'jujutsu-kaisen' }, key);

    expect(res.statusCode).toBe(412);
    // Nessun follow "orfano": il download fallisce prima di seguire.
    expect(follow.list()).toHaveLength(0);
    await app.close();
  });
});
