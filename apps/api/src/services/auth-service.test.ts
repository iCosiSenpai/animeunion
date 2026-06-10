import { eq } from 'drizzle-orm';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../db';
import { createTestDb, testLogger } from '../test/helpers';
import { createAuthService } from './auth-service';

const BASE = 'https://api.test';
const JSON_HEADERS = { headers: { 'content-type': 'application/json' } };

let agent: MockAgent;

function pool() {
  return agent.get(BASE);
}

function makeJwt(expiresAt: Date): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(expiresAt.getTime() / 1000) }),
    'utf8',
  ).toString('base64url');
  return `header.${payload}.signature`;
}

function makeService(db = createTestDb(), overrides: { email?: string; password?: string } = {}) {
  return createAuthService({
    db,
    baseUrl: BASE,
    email: 'user@test.it',
    password: 'segreta',
    logger: testLogger,
    rateLimitMs: 1,
    ...overrides,
  });
}

function interceptLogin(token: string) {
  pool()
    .intercept({ path: '/auth/login', method: 'POST' })
    .reply(200, { token, user: { email: 'user@test.it', name: 'Utente' } }, JSON_HEADERS);
}

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
});

afterEach(async () => {
  await agent.close();
});

describe('AuthService', () => {
  it('fa login al primo getToken e persiste il token su tabella auth', async () => {
    const db = createTestDb();
    const expires = new Date(Math.floor((Date.now() + 60 * 24 * 60 * 60 * 1000) / 1000) * 1000);
    const jwt = makeJwt(expires);
    interceptLogin(jwt);

    const service = makeService(db);
    const token = await service.getToken();

    expect(token).toBe(jwt);
    const row = db.select().from(schema.auth).where(eq(schema.auth.id, 'default')).get();
    expect(row?.accessToken).toBe(jwt);
    expect(row?.tokenExpires).toBe(expires.toISOString());
    expect(row?.userEmail).toBe('user@test.it');
    expect(row?.userName).toBe('Utente');
  });

  it('riusa il token in cache senza nuove richieste', async () => {
    const jwt = makeJwt(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));
    interceptLogin(jwt);

    const service = makeService();
    await service.getToken();
    const second = await service.getToken();

    expect(second).toBe(jwt);
    expect(agent.pendingInterceptors()).toHaveLength(0);
  });

  it('riusa il token persistito su DB da una nuova istanza senza login', async () => {
    const db = createTestDb();
    const jwt = makeJwt(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));
    interceptLogin(jwt);
    await makeService(db).getToken();

    const token = await makeService(db).getToken();

    expect(token).toBe(jwt);
  });

  it('rifa il login se il token persistito e scaduto', async () => {
    const db = createTestDb();
    const timestamp = new Date().toISOString();
    db.insert(schema.auth)
      .values({
        id: 'default',
        accessToken: 'vecchio-token',
        tokenExpires: new Date(Date.now() - 1000).toISOString(),
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    const jwt = makeJwt(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));
    interceptLogin(jwt);

    const token = await makeService(db).getToken();

    expect(token).toBe(jwt);
  });

  it('usa il fallback di 59 giorni se il token non e un JWT decodificabile', async () => {
    const db = createTestDb();
    const fixedNow = new Date('2026-06-10T12:00:00.000Z');
    interceptLogin('token-opaco');

    const service = createAuthService({
      db,
      baseUrl: BASE,
      email: 'user@test.it',
      password: 'segreta',
      logger: testLogger,
      rateLimitMs: 1,
      now: () => fixedNow,
    });
    await service.getToken();

    const row = db.select().from(schema.auth).where(eq(schema.auth.id, 'default')).get();
    const expected = new Date(fixedNow.getTime() + 59 * 24 * 60 * 60 * 1000);
    expect(row?.tokenExpires).toBe(expected.toISOString());
  });

  it('ritorna null senza credenziali e non fa richieste', async () => {
    const service = makeService(createTestDb(), { email: undefined, password: undefined });
    expect(await service.getToken()).toBeNull();
  });

  it('invalidateAndRelogin azzera il token e forza un nuovo login', async () => {
    const db = createTestDb();
    const firstJwt = makeJwt(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));
    const secondJwt = makeJwt(new Date(Date.now() + 61 * 24 * 60 * 60 * 1000));
    interceptLogin(firstJwt);

    const service = makeService(db);
    await service.getToken();

    interceptLogin(secondJwt);
    await service.invalidateAndRelogin();

    expect(await service.getToken()).toBe(secondJwt);
    const row = db.select().from(schema.auth).where(eq(schema.auth.id, 'default')).get();
    expect(row?.accessToken).toBe(secondJwt);
  });

  it('status riflette lo stato di autenticazione', async () => {
    const db = createTestDb();
    const service = makeService(db);
    expect(service.status()).toEqual({ authenticated: false, expiresAt: null, userEmail: null });

    const jwt = makeJwt(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));
    interceptLogin(jwt);
    await service.getToken();

    const status = service.status();
    expect(status.authenticated).toBe(true);
    expect(status.userEmail).toBe('user@test.it');
  });
});
