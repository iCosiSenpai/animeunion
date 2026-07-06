import { eq } from 'drizzle-orm';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../db';
import { decryptPassword, decryptSecret, encryptPassword } from '../lib/crypto';
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

  it('usa il fallback di 1 ora se il token non e un JWT decodificabile', async () => {
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
    const expected = new Date(fixedNow.getTime() + 3_600_000);
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

  it('loginWithCredentials persiste token, email e password e autentica', async () => {
    const db = createTestDb();
    const jwt = makeJwt(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));
    interceptLogin(jwt);

    const service = makeService(db, { email: undefined, password: undefined });
    const status = await service.loginWithCredentials('mario@test.it', 'pw');

    expect(status.authenticated).toBe(true);
    const row = db.select().from(schema.auth).where(eq(schema.auth.id, 'default')).get();
    expect(row?.accessToken).toBe(jwt);
    expect(row?.password).toBe('pw');
  });

  it('usa le credenziali salvate nel DB per il re-login senza env', async () => {
    const db = createTestDb();
    const firstJwt = makeJwt(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));
    interceptLogin(firstJwt);
    const service = makeService(db, { email: undefined, password: undefined });
    await service.loginWithCredentials('mario@test.it', 'pw');

    const secondJwt = makeJwt(new Date(Date.now() + 61 * 24 * 60 * 60 * 1000));
    interceptLogin(secondJwt);
    await service.invalidateAndRelogin();

    expect(await service.getToken()).toBe(secondJwt);
  });

  it('logout azzera token e password', async () => {
    const db = createTestDb();
    const jwt = makeJwt(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));
    interceptLogin(jwt);
    const service = makeService(db, { email: undefined, password: undefined });
    await service.loginWithCredentials('mario@test.it', 'pw');

    service.logout();

    const row = db.select().from(schema.auth).where(eq(schema.auth.id, 'default')).get();
    expect(row?.accessToken).toBeNull();
    expect(row?.password).toBeNull();
    expect(service.status().authenticated).toBe(false);
  });

  it('social: start memorizza il flow (senza esporre il device_code) e poll approved persiste il token', async () => {
    const db = createTestDb();
    pool().intercept({ path: '/auth/social/start', method: 'POST' }).reply(
      200,
      {
        device_code: 'dev-secret',
        user_code: 'WXYZ-2345',
        verification_uri: 'https://api.test/authorize',
        verification_uri_complete: 'https://api.test/authorize?code=WXYZ-2345',
        expires_in: 600,
        interval: 5,
      },
      JSON_HEADERS,
    );

    const service = makeService(db, { email: undefined, password: undefined });
    const startRes = await service.socialStart('google');

    expect(startRes.userCode).toBe('WXYZ-2345');
    expect(startRes.verificationUriComplete).toContain('WXYZ-2345');
    expect(startRes).not.toHaveProperty('deviceCode');

    pool()
      .intercept({ path: '/auth/social/poll', method: 'POST' })
      .reply(200, { status: 'pending' }, JSON_HEADERS);
    expect((await service.socialPoll()).status).toBe('pending');

    const jwt = makeJwt(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));
    pool()
      .intercept({ path: '/auth/social/poll', method: 'POST' })
      .reply(
        200,
        {
          status: 'approved',
          token: jwt,
          expires_in: 5184000,
          user: { email: 'g@test.it', name: 'Goo' },
        },
        JSON_HEADERS,
      );
    const approved = await service.socialPoll();

    expect(approved.status).toBe('approved');
    expect(approved.auth?.authenticated).toBe(true);
    const row = db.select().from(schema.auth).where(eq(schema.auth.id, 'default')).get();
    expect(row?.accessToken).toBe(jwt);
    expect(row?.userEmail).toBe('g@test.it');
    // token gia in cache: nessuna nuova richiesta
    expect(await service.getToken()).toBe(jwt);
  });

  it('social: poll senza flow attivo torna expired', async () => {
    const service = makeService(createTestDb(), { email: undefined, password: undefined });
    expect(await service.socialPoll()).toEqual({ status: 'expired', auth: null });
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

describe('cifratura password (AES-256-GCM)', () => {
  it('encryptPassword + decryptPassword round-trip con chiave', () => {
    const key = 'chiave-test-sicura';
    const plain = 'password-originale';
    const enc = encryptPassword(plain, key);
    expect(enc).toMatch(/^aes256gcm:/);
    expect(enc).not.toContain(plain);
    expect(decryptPassword(enc, key)).toBe(plain);
  });

  it('decryptPassword su valore senza prefisso restituisce il plaintext invariato (backward compat)', () => {
    expect(decryptPassword('vecchia-password-chiara', 'qualsiasi-chiave')).toBe(
      'vecchia-password-chiara',
    );
  });

  it('loginWithCredentials con encryptKey salva la password cifrata nel DB', async () => {
    const db = createTestDb();
    const jwt = makeJwt(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));
    interceptLogin(jwt);

    const service = createAuthService({
      db,
      baseUrl: BASE,
      email: undefined,
      password: undefined,
      logger: testLogger,
      rateLimitMs: 1,
      encryptKey: 'chiave-test',
    });
    await service.loginWithCredentials('mario@test.it', 'pw-segreta');

    const row = db.select().from(schema.auth).where(eq(schema.auth.id, 'default')).get();
    // La password nel DB deve essere cifrata (non in chiaro).
    expect(row?.password).toMatch(/^aes256gcm:/);
    expect(row?.password).not.toContain('pw-segreta');
  });

  it('con encryptKey cifra il token a riposo ma lo restituisce in chiaro (B3)', async () => {
    const db = createTestDb();
    const jwt = makeJwt(
      new Date(Math.floor((Date.now() + 60 * 24 * 60 * 60 * 1000) / 1000) * 1000),
    );
    interceptLogin(jwt);
    const service = createAuthService({
      db,
      baseUrl: BASE,
      email: 'user@test.it',
      password: 'segreta',
      logger: testLogger,
      rateLimitMs: 1,
      encryptKey: 'chiave-test',
    });

    // getToken (login) ritorna il token in chiaro al chiamante...
    expect(await service.getToken()).toBe(jwt);
    // ...ma nel DB e' cifrato (non finisce in chiaro nei backup).
    const row = db.select().from(schema.auth).where(eq(schema.auth.id, 'default')).get();
    expect(row?.accessToken).toMatch(/^aes256gcm:/);
    expect(row?.accessToken).not.toContain(jwt);
    expect(decryptSecret(row?.accessToken ?? '', 'chiave-test')).toBe(jwt);

    // Un'istanza nuova (nessuna cache) rilegge dal DB e decifra correttamente.
    const fresh = createAuthService({
      db,
      baseUrl: BASE,
      email: 'user@test.it',
      password: 'segreta',
      logger: testLogger,
      rateLimitMs: 1,
      encryptKey: 'chiave-test',
    });
    expect(await fresh.getToken()).toBe(jwt);
  });

  it('re-login funziona con password cifrata nel DB (resolveCredentials decifra)', async () => {
    const db = createTestDb();
    const firstJwt = makeJwt(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));
    interceptLogin(firstJwt);

    const service = createAuthService({
      db,
      baseUrl: BASE,
      email: undefined,
      password: undefined,
      logger: testLogger,
      rateLimitMs: 1,
      encryptKey: 'chiave-test',
    });
    await service.loginWithCredentials('mario@test.it', 'pw-segreta');

    const secondJwt = makeJwt(new Date(Date.now() + 61 * 24 * 60 * 60 * 1000));
    interceptLogin(secondJwt);
    await service.invalidateAndRelogin();

    expect(await service.getToken()).toBe(secondJwt);
  });
});
