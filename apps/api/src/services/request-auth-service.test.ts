import { describe, expect, it } from 'vitest';
import { createTestDb } from '../test/helpers';
import { createRequestAuthService } from './request-auth-service';

describe('RequestAuthService', () => {
  it('default: non configurata, verifica sempre falsa', () => {
    const auth = createRequestAuthService({ db: createTestDb() });
    expect(auth.isConfigured()).toBe(false);
    expect(auth.verifyKey('qualsiasi')).toBe(false);
    expect(auth.verifyKey(undefined)).toBe(false);
  });

  it('generateKey configura la chiave e la verifica col valore in chiaro', () => {
    const auth = createRequestAuthService({ db: createTestDb() });
    const { key } = auth.generateKey();

    expect(key).toMatch(/^auk_[0-9a-f]{48}$/);
    expect(auth.isConfigured()).toBe(true);
    expect(auth.verifyKey(key)).toBe(true);
    expect(auth.verifyKey(`${key}x`)).toBe(false);
    expect(auth.verifyKey('auk_sbagliata')).toBe(false);
  });

  it('rigenerare invalida la chiave precedente', () => {
    const auth = createRequestAuthService({ db: createTestDb() });
    const first = auth.generateKey().key;
    const second = auth.generateKey().key;

    expect(second).not.toBe(first);
    expect(auth.verifyKey(first)).toBe(false);
    expect(auth.verifyKey(second)).toBe(true);
  });

  it('revoke rimuove la chiave: si torna non configurati', () => {
    const auth = createRequestAuthService({ db: createTestDb() });
    const { key } = auth.generateKey();
    auth.revoke();

    expect(auth.isConfigured()).toBe(false);
    expect(auth.verifyKey(key)).toBe(false);
  });
});
