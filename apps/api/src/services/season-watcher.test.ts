import type { AnimeDetail, RelatedAnime } from '@animeunion/shared';
import { describe, expect, it } from 'vitest';
import { schema } from '../db';
import { createTestDb } from '../test/helpers';
import type { CatalogService } from './catalog-service';
import { createConfigService } from './config-service';
import { createNotificationService } from './notification-service';
import { createSeasonWatcher } from './season-watcher';

function rel(id: string, relationType = 'SEQUEL'): RelatedAnime {
  return {
    id,
    slug: id,
    title: id,
    titleIta: null,
    coverImage: null,
    type: 'TV',
    seasonYear: null,
    relationType,
    seriesId: null,
    seasonNumber: null,
  };
}

function detail(relatedAnime: RelatedAnime[]): AnimeDetail {
  return { relatedAnime } as unknown as AnimeDetail;
}

function setup() {
  const db = createTestDb();
  const ts = new Date().toISOString();
  db.insert(schema.anime)
    .values({
      id: 'a1',
      slug: 'serie',
      title: 'Serie',
      type: 'TV',
      status: 'ONGOING',
      episodeCount: 12,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  db.insert(schema.follow)
    .values({ id: 'f1', animeId: 'a1', status: 'watching', addedAt: ts, updatedAt: ts })
    .run();
  const config = createConfigService({ db });
  const notifications = createNotificationService({ db, config });
  return { db, config, notifications };
}

describe('SeasonWatcher', () => {
  it('prima scansione = baseline (no notifiche), poi notifica le relazioni nuove', async () => {
    const { db, config, notifications } = setup();
    let related: RelatedAnime[] = [rel('r2')];
    const catalog = { getBySlug: async () => detail(related) } as unknown as CatalogService;
    const watcher = createSeasonWatcher({ db, catalog, notifications, config });

    expect(await watcher.checkNewSeasons()).toBe(0);
    expect(notifications.list()).toHaveLength(0);

    related = [rel('r2'), rel('r3')];
    expect(await watcher.checkNewSeasons()).toBe(1);
    const list = notifications.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.type).toBe('season_available');
  });

  it('esclude i seguiti in pausa (on_hold) e droppati dagli avvisi di nuova stagione', async () => {
    const { db, config, notifications } = setup();
    db.update(schema.follow).set({ status: 'on_hold' }).run();
    let related: RelatedAnime[] = [rel('r2')];
    const catalog = { getBySlug: async () => detail(related) } as unknown as CatalogService;
    const watcher = createSeasonWatcher({ db, catalog, notifications, config });

    // L'on_hold non viene nemmeno preso in carico: niente baseline, niente notifica al cambio.
    expect(await watcher.checkNewSeasons()).toBe(0);
    related = [rel('r2'), rel('r3')];
    expect(await watcher.checkNewSeasons()).toBe(0);
    expect(notifications.list()).toHaveLength(0);
  });

  it('non notifica se notifyNewSeasons è disattivo', async () => {
    const { db, config, notifications } = setup();
    config.set('notifyNewSeasons', false);
    const catalog = { getBySlug: async () => detail([rel('r2')]) } as unknown as CatalogService;
    const watcher = createSeasonWatcher({ db, catalog, notifications, config });

    expect(await watcher.checkNewSeasons()).toBe(0);
    expect(notifications.list()).toHaveLength(0);
  });
});
