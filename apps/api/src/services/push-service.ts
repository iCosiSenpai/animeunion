import { eq } from 'drizzle-orm';
import * as webpush from 'web-push';
import type { Db } from '../db';
import { schema } from '../db';
import type { Logger } from '../lib/logger';

// Chiavi VAPID come righe grezze in config (getAll le ignora → niente leak/migrazione).
const PUB_KEY = 'webpush_vapid_public';
const PRIV_KEY = 'webpush_vapid_private';
const SUBJECT = 'mailto:aniuniontv@gmail.com';

export interface PushPayload {
  title: string;
  body?: string | null;
  url?: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushService {
  /** Chiave pubblica VAPID (generata+persistita al primo uso). */
  getPublicKey(): string;
  subscribe(sub: PushSubscriptionData): void;
  unsubscribe(endpoint: string): void;
  /** Invio best-effort a tutte le sottoscrizioni; rimuove quelle morte (404/410). */
  send(payload: PushPayload): Promise<void>;
}

export function createPushService(deps: {
  db: Db;
  logger?: Logger;
  now?: () => Date;
}): PushService {
  const { db, logger } = deps;
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

  function ensureKeys(): { publicKey: string; privateKey: string } {
    const pub = readConfig(PUB_KEY);
    const priv = readConfig(PRIV_KEY);
    if (pub && priv) {
      return { publicKey: pub, privateKey: priv };
    }
    const keys = webpush.generateVAPIDKeys();
    writeConfig(PUB_KEY, keys.publicKey);
    writeConfig(PRIV_KEY, keys.privateKey);
    return keys;
  }

  return {
    getPublicKey() {
      return ensureKeys().publicKey;
    },

    subscribe(sub) {
      const ts = now().toISOString();
      db.insert(schema.pushSubscription)
        .values({
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          createdAt: ts,
        })
        .onConflictDoUpdate({
          target: schema.pushSubscription.endpoint,
          set: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, createdAt: ts },
        })
        .run();
    },

    unsubscribe(endpoint) {
      db.delete(schema.pushSubscription)
        .where(eq(schema.pushSubscription.endpoint, endpoint))
        .run();
    },

    async send(payload) {
      const rows = db.select().from(schema.pushSubscription).all();
      if (rows.length === 0) {
        return;
      }
      const keys = ensureKeys();
      webpush.setVapidDetails(SUBJECT, keys.publicKey, keys.privateKey);
      const data = JSON.stringify({
        title: payload.title,
        body: payload.body ?? '',
        url: payload.url ?? '/',
      });

      await Promise.all(
        rows.map(async (r) => {
          try {
            await webpush.sendNotification(
              { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
              data,
            );
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              db.delete(schema.pushSubscription)
                .where(eq(schema.pushSubscription.endpoint, r.endpoint))
                .run();
            } else {
              logger?.debug({ err: error, endpoint: r.endpoint }, 'web-push: invio fallito');
            }
          }
        }),
      );
    },
  };
}
