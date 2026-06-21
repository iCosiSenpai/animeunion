import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Env } from '../config/env';
import type { Db } from '../db';
import { schema } from '../db';
import { PreconditionError } from '../lib/errors';

// Righe grezze nella tabella config: getAll (appConfigSchema) le ignora → niente leak/migrazione.
const HASH_KEY = 'web_passcode_hash';
const SECRET_KEY = 'web_session_secret';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 giorni

export interface LockService {
  /** True se un passcode è impostato (e il blocco non è disabilitato da env). */
  isEnabled(): boolean;
  verifyToken(token?: string): boolean;
  status(token?: string): { enabled: boolean; unlocked: boolean };
  unlock(passcode: string): { ok: boolean; token: string | null };
  setPasscode(next: string, current?: string): { token: string };
  disable(current: string): void;
}

export interface LockServiceDeps {
  db: Db;
  env: Pick<Env, 'WEB_LOCK_DISABLED'>;
  now?: () => Date;
}

export function createLockService(deps: LockServiceDeps): LockService {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());
  const disabledByEnv = deps.env.WEB_LOCK_DISABLED === 'true';

  function readConfig(key: string): string | null {
    const row = db
      .select({ value: schema.config.value })
      .from(schema.config)
      .where(eq(schema.config.key, key))
      .get();
    if (!row) {
      return null;
    }
    try {
      return JSON.parse(row.value) as string;
    } catch {
      return null;
    }
  }

  function writeConfig(key: string, value: string): void {
    const ts = now().toISOString();
    const serialized = JSON.stringify(value);
    db.insert(schema.config)
      .values({ key, value: serialized, updatedAt: ts })
      .onConflictDoUpdate({ target: schema.config.key, set: { value: serialized, updatedAt: ts } })
      .run();
  }

  function getHash(): string | null {
    return readConfig(HASH_KEY);
  }

  function getSecret(): string {
    const existing = readConfig(SECRET_KEY);
    if (existing) {
      return existing;
    }
    const secret = randomBytes(32).toString('hex');
    writeConfig(SECRET_KEY, secret);
    return secret;
  }

  function hashPasscode(passcode: string): string {
    const salt = randomBytes(16).toString('hex');
    const dk = scryptSync(passcode, salt, 32).toString('hex');
    return `${salt}:${dk}`;
  }

  function verifyPasscode(passcode: string): boolean {
    const stored = getHash();
    if (!stored) {
      return false;
    }
    const [salt, dkHex] = stored.split(':');
    if (!salt || !dkHex) {
      return false;
    }
    const dk = scryptSync(passcode, salt, 32);
    const expected = Buffer.from(dkHex, 'hex');
    return dk.length === expected.length && timingSafeEqual(dk, expected);
  }

  function sign(exp: number, secret: string): string {
    return createHmac('sha256', secret).update(String(exp)).digest('hex');
  }

  function issueToken(): string {
    const exp = now().getTime() + TOKEN_TTL_MS;
    return `${exp}.${sign(exp, getSecret())}`;
  }

  function isEnabled(): boolean {
    return !disabledByEnv && getHash() !== null;
  }

  function verifyToken(token?: string): boolean {
    if (!token) {
      return false;
    }
    const dot = token.indexOf('.');
    if (dot <= 0) {
      return false;
    }
    const exp = Number(token.slice(0, dot));
    if (!Number.isFinite(exp) || exp < now().getTime()) {
      return false;
    }
    const provided = Buffer.from(token.slice(dot + 1));
    const expected = Buffer.from(sign(exp, getSecret()));
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  }

  return {
    isEnabled,
    verifyToken,

    status(token) {
      const enabled = isEnabled();
      return { enabled, unlocked: !enabled || verifyToken(token) };
    },

    unlock(passcode) {
      if (!isEnabled()) {
        return { ok: true, token: null };
      }
      if (!verifyPasscode(passcode)) {
        return { ok: false, token: null };
      }
      return { ok: true, token: issueToken() };
    },

    setPasscode(next, current) {
      if (getHash() !== null && !verifyPasscode(current ?? '')) {
        throw new PreconditionError('Passcode attuale errato');
      }
      writeConfig(HASH_KEY, hashPasscode(next));
      return { token: issueToken() };
    },

    disable(current) {
      if (getHash() === null) {
        return;
      }
      if (!verifyPasscode(current)) {
        throw new PreconditionError('Passcode attuale errato');
      }
      db.delete(schema.config).where(eq(schema.config.key, HASH_KEY)).run();
      // Ruota il secret: invalida eventuali token in giro.
      writeConfig(SECRET_KEY, randomBytes(32).toString('hex'));
    },
  };
}
