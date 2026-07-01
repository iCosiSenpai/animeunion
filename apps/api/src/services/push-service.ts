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
  /** Chiave pubblica VAPID. Null se le chiavi sono in stato inconsistente (una sola presente). */
  getPublicKey(): string | null;
  subscribe(sub: PushSubscriptionData): void;
  unsubscribe(endpoint: string): void;
  /** Invio best-effort a tutte le sottoscrizioni; rimuove quelle morte (404/410). */
  send(payload: PushPayload): Promise<void>;
  /**
   * Invio di prova (pulsante "Invia notifica di test"). Ritorna quante sottoscrizioni sono state
   * raggiunte; `ok:false, sent:0` se nessun dispositivo e' iscritto.
   */
  test(): Promise<{ ok: boolean; sent: number }>;
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

  function ensureKeys(): { publicKey: string; privateKey: string } | null {
    const pub = readConfig(PUB_KEY);
    const priv = readConfig(PRIV_KEY);
    if (pub && priv) {
      return { publicKey: pub, privateKey: priv };
    }
    // Stato inconsistente: una chiave presente e l'altra no → non rigenerare per non
    // invalidare le subscription push esistenti. L'utente deve risolvere manualmente.
    if (pub || priv) {
      logger?.error(
        { hasPub: Boolean(pub), hasPriv: Boolean(priv) },
        "VAPID keys inconsistenti: una chiave è presente e l'altra manca. Rigenera manualmente eliminando entrambe dalla tabella config.",
      );
      return null;
    }
    // Nessuna chiave → primo avvio, genera e persiste entrambe.
    const keys = webpush.generateVAPIDKeys();
    writeConfig(PUB_KEY, keys.publicKey);
    writeConfig(PRIV_KEY, keys.privateKey);
    return keys;
  }

  async function sendToAll(payload: PushPayload): Promise<number> {
    const rows = db.select().from(schema.pushSubscription).all();
    if (rows.length === 0) {
      return 0;
    }
    const keys = ensureKeys();
    if (!keys) {
      logger?.error('Push disabilitato: VAPID keys inconsistenti, invio saltato');
      return 0;
    }
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
    return rows.length;
  }

  return {
    getPublicKey() {
      return ensureKeys()?.publicKey ?? null;
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
      await sendToAll(payload);
    },

    async test() {
      const sent = await sendToAll({
        title: 'AnimeUnion Docker',
        body: 'Notifica di prova: le notifiche push funzionano! 🎉',
        url: '/',
      });
      return { ok: sent > 0, sent };
    },
  };
}
