import { describe, expect, it } from 'vitest';
import { schema } from '../db';
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

  it('list popola animeSlug via join e markRead marca la singola', () => {
    const db = createTestDb();
    const config = createConfigService({ db });
    const ts = new Date().toISOString();
    db.insert(schema.anime)
      .values({
        id: 'a1',
        slug: 'my-anime',
        title: 'My Anime',
        type: 'TV',
        status: 'ONGOING',
        episodeCount: 0,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    const svc = createNotificationService({ db, config });
    const withAnime = svc.create({ type: 'download_complete', title: 'done', animeId: 'a1' });
    svc.create({ type: 'info', title: 'plain' });

    const list = svc.list();
    expect(list.find((n) => n.id === withAnime.id)?.animeSlug).toBe('my-anime');
    expect(list.find((n) => n.title === 'plain')?.animeSlug).toBeNull();

    expect(svc.markRead(withAnime.id)).toBe(1);
    expect(svc.unreadCount()).toBe(1);
  });
});
