import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';

// Riga grezza nella tabella config: getAll (appConfigSchema) la ignora → niente leak verso il
// frontend, niente migrazione. Stesso pattern del passcode in lock-service.
const HASH_KEY = 'request_api_key_hash';

export interface RequestAuthService {
  /** True se una chiave API per le richieste in ingresso e stata generata. */
  isConfigured(): boolean;
  /** Genera una nuova chiave: ne salva solo l'hash, restituisce il valore in chiaro UNA volta. */
  generateKey(): { key: string };
  /** Confronto a tempo costante; false se la chiave manca, e errata o non e configurata. */
  verifyKey(key?: string): boolean;
  /** Revoca la chiave: le richieste in ingresso tornano non autorizzate finche non se ne genera una. */
  revoke(): void;
}

export interface RequestAuthServiceDeps {
  db: Db;
  now?: () => Date;
}

export function createRequestAuthService(deps: RequestAuthServiceDeps): RequestAuthService {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());

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

  function hashKey(key: string): string {
    const salt = randomBytes(16).toString('hex');
    const dk = scryptSync(key, salt, 32).toString('hex');
    return `${salt}:${dk}`;
  }

  return {
    isConfigured(): boolean {
      return readConfig(HASH_KEY) !== null;
    },

    generateKey(): { key: string } {
      // Prefisso "auk_" (AnimeUnion Key) per riconoscibilita; il valore in chiaro non e mai salvato.
      const key = `auk_${randomBytes(24).toString('hex')}`;
      writeConfig(HASH_KEY, hashKey(key));
      return { key };
    },

    verifyKey(key?: string): boolean {
      if (!key) {
        return false;
      }
      const stored = readConfig(HASH_KEY);
      if (!stored) {
        return false;
      }
      const [salt, dkHex] = stored.split(':');
      if (!salt || !dkHex) {
        return false;
      }
      const dk = scryptSync(key, salt, 32);
      const expected = Buffer.from(dkHex, 'hex');
      return dk.length === expected.length && timingSafeEqual(dk, expected);
    },

    revoke(): void {
      db.delete(schema.config).where(eq(schema.config.key, HASH_KEY)).run();
    },
  };
}
