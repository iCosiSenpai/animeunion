import type { Notification, NotificationType } from '@animeunion/shared';
import { desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import type { Logger } from '../lib/logger';
import type { TelegramCredentials, TelegramNotifier } from '../lib/telegram';
import type { ConfigService } from './config-service';

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body?: string | null;
  animeId?: string | null;
}

export interface NotificationService {
  create(input: CreateNotificationInput): Notification;
  list(limit?: number): Notification[];
  unreadCount(): number;
  markAllRead(): number;
  clear(): number;
  /** Invio di prova su Telegram (per il bottone "Invia test" nelle Impostazioni). */
  testTelegram(override?: TelegramCredentials): Promise<{ ok: boolean; error?: string }>;
}

export interface NotificationServiceDeps {
  db: Db;
  config: ConfigService;
  telegram?: TelegramNotifier;
  logger?: Logger;
  now?: () => Date;
}

type Row = typeof schema.notification.$inferSelect;

function toNotification(row: Row): Notification {
  return {
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    animeId: row.animeId,
    read: row.read === 1,
    createdAt: row.createdAt,
  };
}

export function createNotificationService(deps: NotificationServiceDeps): NotificationService {
  const { db, config, telegram, logger } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    create(input) {
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
      return toNotification(row);
    },

    list(limit = 50) {
      return db
        .select()
        .from(schema.notification)
        .orderBy(desc(schema.notification.createdAt))
        .limit(limit)
        .all()
        .map(toNotification);
    },

    unreadCount() {
      return db
        .select({ id: schema.notification.id })
        .from(schema.notification)
        .where(eq(schema.notification.read, 0))
        .all().length;
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
