import { describe, expect, it } from 'vitest';
import { createTestDb } from '../test/helpers';
import { createConfigService } from './config-service';
import { createNotificationService } from './notification-service';

describe('NotificationService', () => {
  it('create/list/unreadCount/markAllRead/clear', () => {
    const db = createTestDb();
    const config = createConfigService({ db });
    const svc = createNotificationService({ db, config });

    svc.create({ type: 'download_complete', title: 'A' });
    svc.create({ type: 'download_failed', title: 'B', body: 'err', animeId: 'x' });

    expect(svc.unreadCount()).toBe(2);
    const list = svc.list();
    expect(list).toHaveLength(2);
    expect(list[0]?.read).toBe(false);

    expect(svc.markAllRead()).toBe(2);
    expect(svc.unreadCount()).toBe(0);

    // clear rimuove solo le lette
    expect(svc.clear()).toBe(2);
    expect(svc.list()).toHaveLength(0);
  });

  it('clear conserva le notifiche non lette', () => {
    const db = createTestDb();
    const config = createConfigService({ db });
    const svc = createNotificationService({ db, config });
    svc.create({ type: 'info', title: 'unread' });
    expect(svc.clear()).toBe(0);
    expect(svc.list()).toHaveLength(1);
  });
});
