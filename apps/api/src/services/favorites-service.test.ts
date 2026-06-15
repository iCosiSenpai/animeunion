import type { AnimeSource, Favorite } from '@animeunion/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '../db';
import { createMockSource } from '../sources/mock-source';
import { createTestDb, testLogger } from '../test/helpers';
import { createCatalogService } from './catalog-service';
import { createConfigService } from './config-service';
import { createFavoritesService } from './favorites-service';

async function setup(overrides: Partial<AnimeSource> = {}) {
  const db = createTestDb();
  // Object.assign preserva i metodi del mock (sul prototype) e applica gli override come own-props.
  const source: AnimeSource = Object.assign(createMockSource(), overrides);
  const config = createConfigService({ db });
  const catalog = createCatalogService({ db, source, config, logger: testLogger });
  // Popola la cache catalogo per avere slug/animeId reali.
  const page = await catalog.search({ query: '', page: 1 });
  const first = page.data[0];
  if (!first) {
    throw new Error('catalogo mock vuoto');
  }
  const favorites = createFavoritesService({ db, source, catalog, config, logger: testLogger });
  return { db, favorites, config, first };
}

describe('FavoritesService', () => {
  it('importFromSite crea i follow locali e accoda i download (autoDownload on)', async () => {
    const { db, favorites, first } = await setup({
      getFavorites: async (): Promise<Favorite[]> => [
        {
          animeId: first.id,
          slug: first.slug,
          title: first.title,
          coverImage: null,
          addedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const result = await favorites.importFromSite();

    expect(result.imported).toBe(1);
    const follow = db.select().from(schema.follow).where(eq(schema.follow.animeId, first.id)).get();
    expect(follow).toBeDefined();
    // gli episodi del mock vengono scaricati da getBySlug, quindi la coda si popola
    expect(result.enqueued).toBeGreaterThan(0);
    const queue = db.select().from(schema.downloadQueue).all();
    expect(queue.length).toBe(result.enqueued);
  });

  it('non riaccoda gli stessi episodi su una seconda esecuzione (idempotente)', async () => {
    const { favorites, first } = await setup({
      getFavorites: async (): Promise<Favorite[]> => [
        {
          animeId: first.id,
          slug: first.slug,
          title: first.title,
          coverImage: null,
          addedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    await favorites.importFromSite();
    const second = await favorites.importFromSite();

    expect(second.enqueued).toBe(0);
  });

  it('non accoda nulla se autoDownload e disattivato', async () => {
    const { favorites, config, first } = await setup({
      getFavorites: async (): Promise<Favorite[]> => [
        {
          animeId: first.id,
          slug: first.slug,
          title: first.title,
          coverImage: null,
          addedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });
    config.set('autoDownload', false);

    const result = await favorites.importFromSite();

    expect(result.imported).toBe(1);
    expect(result.enqueued).toBe(0);
  });

  it('tollera endpoint assente o in errore (404 pre-deploy) senza lanciare', async () => {
    const withoutEndpoint = await setup();
    await expect(withoutEndpoint.favorites.importFromSite()).resolves.toEqual({
      imported: 0,
      enqueued: 0,
    });

    const failing = await setup({
      getFavorites: async () => {
        throw new Error('404 Not Found');
      },
    });
    await expect(failing.favorites.importFromSite()).resolves.toEqual({ imported: 0, enqueued: 0 });
  });

  it('getHistory arricchisce con titolo/cover dalla cache locale', async () => {
    const { favorites, first } = await setup({
      getHistory: async () => [
        {
          animeId: first.id,
          slug: first.slug,
          episodeNumber: 3,
          watchedAt: '2026-01-02T00:00:00Z',
          completed: false,
        },
      ],
    });

    const history = await favorites.getHistory();

    expect(history).toHaveLength(1);
    expect(history[0]?.title).toBe(first.titleIta ?? first.title);
    expect(history[0]?.episodeNumber).toBe(3);
  });

  it('importFromSite propaga gli errori di getBySlug come anime non importabile', async () => {
    const { favorites } = await setup({
      getFavorites: async (): Promise<Favorite[]> => [
        {
          animeId: 'ghost',
          slug: 'slug-inesistente',
          title: 'Ghost',
          coverImage: null,
          addedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const result = await favorites.importFromSite();
    expect(result.imported).toBe(0);
  });
});
