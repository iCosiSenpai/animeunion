import fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { integrationRoutes } from './integration-routes';
import { createRequestAuthService } from './services/request-auth-service';
import { createTestDb } from './test/helpers';
import type { Context } from './trpc';

async function makeApp(configured = true) {
  const db = createTestDb();
  const requestAuth = createRequestAuthService({ db });
  const key = configured ? requestAuth.generateKey().key : '';
  const ctx = { services: { requestAuth } } as unknown as Context;
  const app = fastify();
  await app.register(integrationRoutes(ctx), { prefix: '/api/integration' });
  return { app, key };
}

function post(app: Awaited<ReturnType<typeof makeApp>>['app'], body: unknown, key?: string) {
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
    const res = await post(app, { slug: 'one-piece' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('con X-Api-Key errata risponde 401', async () => {
    const { app } = await makeApp();
    const res = await post(app, { slug: 'one-piece' }, 'auk_sbagliata');
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('se nessuna chiave e configurata, risponde 401 anche con un header', async () => {
    const { app } = await makeApp(false);
    const res = await post(app, { slug: 'one-piece' }, 'auk_qualsiasi');
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

  it('con chiave valida e body valido supera auth+validazione (501 skeleton)', async () => {
    const { app, key } = await makeApp();
    const res = await post(app, { slug: 'one-piece' }, key);
    expect(res.statusCode).toBe(501);
    await app.close();
  });
});
