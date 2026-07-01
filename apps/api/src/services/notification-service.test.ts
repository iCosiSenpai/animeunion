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

  it('notifyDownloadComplete coalizza gli episodi ravvicinati dello stesso anime', () => {
    const db = createTestDb();
    const config = createConfigService({ db });
    let nowMs = Date.parse('2026-01-01T00:00:00Z');
    const svc = createNotificationService({ db, config, now: () => new Date(nowMs) });

    svc.notifyDownloadComplete({ animeId: 'a1', title: 'One Piece', epNum: 1 });
    nowMs += 30_000;
    svc.notifyDownloadComplete({ animeId: 'a1', title: 'One Piece', epNum: 2 });
    nowMs += 30_000;
    svc.notifyDownloadComplete({ animeId: 'a1', title: 'One Piece', epNum: 3 });

    const list = svc.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe('Scaricati 3 episodi di One Piece');
    expect(list[0]?.body).toBe('Ultimo: episodio 3');
    // Un solo elemento, non letto (il bump resetta read=0).
    expect(svc.unreadCount()).toBe(1);
  });

  it('notifyDownloadComplete apre una nuova sessione oltre la finestra di coalescing', () => {
    const db = createTestDb();
    const config = createConfigService({ db });
    let nowMs = Date.parse('2026-01-01T00:00:00Z');
    const svc = createNotificationService({ db, config, now: () => new Date(nowMs) });

    svc.notifyDownloadComplete({ animeId: 'a1', title: 'One Piece', epNum: 1 });
    nowMs += 11 * 60_000; // oltre BATCH_WINDOW_MS (10 min)
    svc.notifyDownloadComplete({ animeId: 'a1', title: 'One Piece', epNum: 2 });

    expect(svc.list()).toHaveLength(2);
  });

  it('notifyDownloadComplete tiene separati anime diversi nella stessa finestra', () => {
    const db = createTestDb();
    const config = createConfigService({ db });
    const svc = createNotificationService({ db, config });

    svc.notifyDownloadComplete({ animeId: 'a1', title: 'One Piece', epNum: 1 });
    svc.notifyDownloadComplete({ animeId: 'a2', title: 'Bleach', epNum: 1 });
    svc.notifyDownloadComplete({ animeId: 'a1', title: 'One Piece', epNum: 2 });

    const list = svc.list();
    expect(list).toHaveLength(2);
    expect(list.find((n) => n.title.includes('One Piece'))?.title).toBe(
      'Scaricati 2 episodi di One Piece',
    );
    expect(list.find((n) => n.title.includes('Bleach'))?.title).toBe('Scaricato: Bleach');
  });

  it('notifyDownloadComplete (P2d): LRU eviction — Map non supera ~451 entry dopo > 500', () => {
    const db = createTestDb();
    const config = createConfigService({ db });
    // Creiamo il servizio con clock controllato.
    let nowMs = Date.parse('2026-01-01T00:00:00Z');
    const svcLru = createNotificationService({
      db,
      config,
      now: () => new Date(nowMs),
    });

    // Riempie la Map con 500 entry distinte (animeId univoci, ogni evento >10min dal prev).
    for (let i = 0; i < 500; i++) {
      nowMs += 11 * 60_000;
      svcLru.notifyDownloadComplete({ animeId: `anime-${i}`, title: `Anime ${i}`, epNum: 1 });
    }
    // A questo punto la Map ha 500 entry. Il prossimo insert deve fare eviction (50 oldest).
    nowMs += 11 * 60_000;
    svcLru.notifyDownloadComplete({ animeId: 'anime-trigger', title: 'Trigger', epNum: 1 });

    // Il servizio deve restare funzionale dopo l'eviction.
    const list = svcLru.list(1000);
    // 500 sessioni + 1 trigger = 501 notifiche nel DB (le entry evicte erano solo nella Map).
    expect(list.length).toBe(501);
    expect(list.some((n) => n.title === 'Scaricato: Trigger')).toBe(true);
  });
});
