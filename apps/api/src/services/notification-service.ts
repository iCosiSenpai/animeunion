import type { Notification, NotificationType } from '@animeunion/shared';
import { desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import type { Logger } from '../lib/logger';
import type { TelegramCredentials, TelegramNotifier } from '../lib/telegram';
import type { ConfigService } from './config-service';
import type { PushService } from './push-service';

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body?: string | null;
  animeId?: string | null;
}

export interface DownloadCompleteInput {
  animeId: string | null;
  title: string;
  epNum: number | null;
}

export interface NotificationService {
  create(input: CreateNotificationInput): Notification;
  /**
   * Notifica di download completato con coalescing anti-rumore: episodi dello stesso anime
   * completati entro una finestra di sessione aggiornano UNA sola notifica ("Scaricati N
   * episodi di X") invece di generarne N. Inoltra a Telegram/Push solo al primo episodio della
   * sessione (i merge aggiornano solo la riga in-app).
   */
  notifyDownloadComplete(input: DownloadCompleteInput): Notification;
  list(limit?: number): Notification[];
  unreadCount(): number;
  markRead(id: string): number;
  markAllRead(): number;
  clear(): number;
  /** Invio di prova su Telegram (per il bottone "Invia test" nelle Impostazioni). */
  testTelegram(override?: TelegramCredentials): Promise<{ ok: boolean; error?: string }>;
}

// Finestra di coalescing: episodi dello stesso anime completati entro questo intervallo
// confluiscono in un'unica notifica riassuntiva. Con MAX_CONCURRENT=1 i download finiscono in
// sequenza, quindi una finestra ampia coalizza un flusso continuo (es. coda One Piece). Un gap
// piu' lungo (download fermo) apre una nuova sessione/riga.
const BATCH_WINDOW_MS = 10 * 60_000;

export interface NotificationServiceDeps {
  db: Db;
  config: ConfigService;
  telegram?: TelegramNotifier;
  push?: PushService;
  logger?: Logger;
  now?: () => Date;
}

type Row = typeof schema.notification.$inferSelect;

function toNotification(row: Row, animeSlug: string | null = null): Notification {
  return {
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    animeId: row.animeId,
    animeSlug,
    read: row.read === 1,
    createdAt: row.createdAt,
  };
}

interface DownloadAggregate {
  notificationId: string;
  count: number;
  lastEpNum: number | null;
  lastAt: number;
}

export function createNotificationService(deps: NotificationServiceDeps): NotificationService {
  const { db, config, telegram, push, logger } = deps;
  const now = deps.now ?? (() => new Date());

  // Aggregati di download in corso, per anime (chiave = animeId o sentinella). In memoria:
  // basta una voce per anime, costo trascurabile. La freschezza si valuta lazy sull'evento
  // successivo, quindi niente timer (deterministico e testabile iniettando `now`).
  const downloadAggregates = new Map<string, DownloadAggregate>();

  // Destinazione del click sulla notifica push: scheda anime se risolvibile, altrimenti pagine note.
  function pushUrlFor(input: CreateNotificationInput): string {
    if (input.animeId) {
      const row = db
        .select({ slug: schema.anime.slug })
        .from(schema.anime)
        .where(eq(schema.anime.id, input.animeId))
        .get();
      if (row?.slug) {
        return `/catalog/${row.slug}`;
      }
    }
    if (input.type === 'download_complete' || input.type === 'download_failed') {
      return '/downloads';
    }
    return '/';
  }

  function createNotification(input: CreateNotificationInput): Notification {
    const row: Row = {
      id: crypto.randomUUID(),
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      animeId: input.animeId ?? null,
      read: 0,
      createdAt: now().toISOString(),
    };
    db.insert(schema.notification).values(row).run();

    // Inoltro Telegram best-effort (non blocca, non lancia).
    if (config.get('notifyTelegram') && telegram?.isConfigured()) {
      const text = input.body ? `${input.title}\n${input.body}` : input.title;
      void telegram.send(text).catch((error) => {
        logger?.debug({ err: error }, 'Notifica Telegram non inviata');
      });
    }

    // Web push best-effort (no-op se nessuna sottoscrizione).
    if (push && config.get('notifyWebPush')) {
      void push
        .send({ title: input.title, body: input.body ?? null, url: pushUrlFor(input) })
        .catch((error) => {
          logger?.debug({ err: error }, 'Notifica push non inviata');
        });
    }
    return toNotification(row);
  }

  return {
    create: createNotification,

    notifyDownloadComplete(input) {
      const key = input.animeId ?? '__none__';
      const nowMs = now().getTime();
      const agg = downloadAggregates.get(key);

      if (agg && nowMs - agg.lastAt <= BATCH_WINDOW_MS) {
        const count = agg.count + 1;
        const lastEpNum = input.epNum ?? agg.lastEpNum;
        const title = `Scaricati ${count} episodi di ${input.title}`;
        const body = lastEpNum != null ? `Ultimo: episodio ${lastEpNum}` : null;
        const createdAt = now().toISOString();
        const result = db
          .update(schema.notification)
          .set({ title, body, read: 0, createdAt })
          .where(eq(schema.notification.id, agg.notificationId))
          .run();
        if (result.changes > 0) {
          // Aggiorna solo la riga in-app: niente nuovo inoltro Telegram/Push (anti-rumore).
          downloadAggregates.set(key, {
            notificationId: agg.notificationId,
            count,
            lastEpNum,
            lastAt: nowMs,
          });
          return {
            id: agg.notificationId,
            type: 'download_complete',
            title,
            body,
            animeId: input.animeId,
            animeSlug: null,
            read: false,
            createdAt,
          };
        }
        // La riga e' sparita (es. clear): apri una sessione nuova qui sotto.
      }

      // Nuova sessione: notifica singola (inoltra a Telegram/Push una volta sola).
      const created = createNotification({
        type: 'download_complete',
        title: `Scaricato: ${input.title}`,
        body: input.epNum != null ? `Episodio ${input.epNum}` : null,
        animeId: input.animeId,
      });
      downloadAggregates.set(key, {
        notificationId: created.id,
        count: 1,
        lastEpNum: input.epNum,
        lastAt: nowMs,
      });
      return created;
    },

    list(limit = 50) {
      // Join al volo con anime per ricavare lo slug (link "vai alla scheda").
      return db
        .select({
          id: schema.notification.id,
          type: schema.notification.type,
          title: schema.notification.title,
          body: schema.notification.body,
          animeId: schema.notification.animeId,
          read: schema.notification.read,
          createdAt: schema.notification.createdAt,
          animeSlug: schema.anime.slug,
        })
        .from(schema.notification)
        .leftJoin(schema.anime, eq(schema.anime.id, schema.notification.animeId))
        .orderBy(desc(schema.notification.createdAt))
        .limit(limit)
        .all()
        .map((row) => toNotification(row as Row, row.animeSlug ?? null));
    },

    unreadCount() {
      return db
        .select({ id: schema.notification.id })
        .from(schema.notification)
        .where(eq(schema.notification.read, 0))
        .all().length;
    },

    markRead(id) {
      const result = db
        .update(schema.notification)
        .set({ read: 1 })
        .where(eq(schema.notification.id, id))
        .run();
      return result.changes;
    },

    markAllRead() {
      const result = db
        .update(schema.notification)
        .set({ read: 1 })
        .where(eq(schema.notification.read, 0))
        .run();
      return result.changes;
    },

    clear() {
      // Mantiene le non lette; rimuove solo quelle già lette.
      const result = db
        .delete(schema.notification)
        .where(inArray(schema.notification.read, [1]))
        .run();
      return result.changes;
    },

    async testTelegram(override) {
      if (!telegram) {
        return { ok: false, error: 'Telegram non disponibile' };
      }
      return telegram.sendTest(override);
    },
  };
}
