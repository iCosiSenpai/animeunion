import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../db';
import { createTestDb } from '../test/helpers';
import { createPushService } from './push-service';

const lib = vi.hoisted(() => ({ generate: vi.fn(), sendNotification: vi.fn() }));

vi.mock('web-push', () => ({
  generateVAPIDKeys: lib.generate,
  setVapidDetails: vi.fn(),
  sendNotification: lib.sendNotification,
}));

beforeEach(() => {
  lib.generate.mockReset();
  lib.generate.mockReturnValue({ publicKey: 'PUBKEY', privateKey: 'PRIVKEY' });
  lib.sendNotification.mockReset();
  lib.sendNotification.mockResolvedValue(undefined);
});

describe('PushService', () => {
  it('getPublicKey genera le chiavi VAPID una sola volta (persistite)', () => {
    const db = createTestDb();
    expect(createPushService({ db }).getPublicKey()).toBe('PUBKEY');
    // Seconda istanza: legge dal DB, non rigenera.
    expect(createPushService({ db }).getPublicKey()).toBe('PUBKEY');
    expect(lib.generate).toHaveBeenCalledTimes(1);
  });

  it('subscribe/unsubscribe gestiscono le sottoscrizioni', () => {
    const db = createTestDb();
    const push = createPushService({ db });
    push.subscribe({ endpoint: 'https://e/1', keys: { p256dh: 'p', auth: 'a' } });
    expect(db.select().from(schema.pushSubscription).all()).toHaveLength(1);
    push.unsubscribe('https://e/1');
    expect(db.select().from(schema.pushSubscription).all()).toHaveLength(0);
  });

  it('send invia a tutte le sub e rimuove quelle morte (410)', async () => {
    const db = createTestDb();
    const push = createPushService({ db });
    push.subscribe({ endpoint: 'https://e/ok', keys: { p256dh: 'p', auth: 'a' } });
    push.subscribe({ endpoint: 'https://e/dead', keys: { p256dh: 'p', auth: 'a' } });

    lib.sendNotification.mockImplementation((sub: { endpoint: string }) =>
      sub.endpoint === 'https://e/dead'
        ? Promise.reject({ statusCode: 410 })
        : Promise.resolve(undefined),
    );

    await push.send({ title: 'T', body: 'B', url: '/' });

    expect(lib.sendNotification).toHaveBeenCalledTimes(2);
    const rows = db.select().from(schema.pushSubscription).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.endpoint).toBe('https://e/ok');
  });

  it('test senza sottoscrizioni non invia nulla', async () => {
    const db = createTestDb();
    const push = createPushService({ db });
    const res = await push.test();
    expect(res).toEqual({ ok: false, sent: 0 });
    expect(lib.sendNotification).not.toHaveBeenCalled();
  });

  it('test con una sottoscrizione invia la notifica demo', async () => {
    const db = createTestDb();
    const push = createPushService({ db });
    push.subscribe({ endpoint: 'https://e/ok', keys: { p256dh: 'p', auth: 'a' } });
    const res = await push.test();
    expect(res).toEqual({ ok: true, sent: 1 });
    expect(lib.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('getPublicKey restituisce null se pubKey presente ma privKey mancante (stato inconsistente)', () => {
    const db = createTestDb();
    // Inserisce solo la chiave pubblica in tabella config.
    db.insert(schema.config)
      .values({
        key: 'webpush_vapid_public',
        value: JSON.stringify('PUBKEY-ORFANA'),
        updatedAt: new Date().toISOString(),
      })
      .run();

    const result = createPushService({ db }).getPublicKey();

    expect(result).toBeNull();
    expect(lib.generate).not.toHaveBeenCalled();
  });

  it('getPublicKey restituisce null se privKey presente ma pubKey mancante (stato inconsistente)', () => {
    const db = createTestDb();
    // Inserisce solo la chiave privata in tabella config.
    db.insert(schema.config)
      .values({
        key: 'webpush_vapid_private',
        value: JSON.stringify('PRIVKEY-ORFANA'),
        updatedAt: new Date().toISOString(),
      })
      .run();

    const result = createPushService({ db }).getPublicKey();

    expect(result).toBeNull();
    expect(lib.generate).not.toHaveBeenCalled();
  });

  it('send non invia nulla se le VAPID keys sono inconsistenti', async () => {
    const db = createTestDb();
    db.insert(schema.config)
      .values({
        key: 'webpush_vapid_public',
        value: JSON.stringify('PUBKEY-ORFANA'),
        updatedAt: new Date().toISOString(),
      })
      .run();
    const push = createPushService({ db });
    push.subscribe({ endpoint: 'https://e/ok', keys: { p256dh: 'p', auth: 'a' } });

    await push.send({ title: 'T', body: 'B', url: '/' });

    expect(lib.sendNotification).not.toHaveBeenCalled();
  });
});
