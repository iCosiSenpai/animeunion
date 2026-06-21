import { describe, expect, it } from 'vitest';
import type { Db } from '../db';
import { createTestDb } from '../test/helpers';
import { createLockService } from './lock-service';

function svc(db: Db, disabled = false) {
  return createLockService({ db, env: { WEB_LOCK_DISABLED: disabled ? 'true' : undefined } });
}

describe('LockService', () => {
  it('default: disattivato e sbloccato', () => {
    const lock = svc(createTestDb());
    expect(lock.isEnabled()).toBe(false);
    expect(lock.status().unlocked).toBe(true);
  });

  it('setPasscode attiva il blocco; unlock col passcode giusto dà un token valido', () => {
    const lock = svc(createTestDb());
    const { token } = lock.setPasscode('1234');

    expect(lock.isEnabled()).toBe(true);
    expect(lock.verifyToken(token)).toBe(true);
    expect(lock.status().unlocked).toBe(false);
    expect(lock.status(token).unlocked).toBe(true);

    expect(lock.unlock('9999').ok).toBe(false);
    const ok = lock.unlock('1234');
    expect(ok.ok).toBe(true);
    expect(lock.verifyToken(ok.token ?? undefined)).toBe(true);
  });

  it('il cambio passcode richiede quello attuale; disable torna aperto', () => {
    const lock = svc(createTestDb());
    lock.setPasscode('1234');

    expect(() => lock.setPasscode('5678', 'wrong')).toThrow();
    lock.setPasscode('5678', '1234');
    expect(lock.unlock('5678').ok).toBe(true);

    expect(() => lock.disable('wrong')).toThrow();
    lock.disable('5678');
    expect(lock.isEnabled()).toBe(false);
  });

  it('WEB_LOCK_DISABLED forza aperto anche con un hash impostato', () => {
    const db = createTestDb();
    svc(db).setPasscode('1234');
    const lock = svc(db, true);
    expect(lock.isEnabled()).toBe(false);
    expect(lock.status().unlocked).toBe(true);
  });
});
