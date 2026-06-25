import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../lib/errors';
import { createMockSource } from '../sources/mock-source';
import { createTestDb, testLogger } from '../test/helpers';
import { createCatalogService } from './catalog-service';
import { createConfigService } from './config-service';
import { createDownloadService } from './download-service';
import { createFollowService } from './follow-service';
import { createRequestService } from './request-service';
import { createSeriesResolver } from './series-resolver';

function setup() {
  const db = createTestDb();
  const source = createMockSource();
  const config = createConfigService({ db });
  const catalog = createCatalogService({ db, source, config, logger: testLogger });
  const resolver = createSeriesResolver({ db });
  const follow = createFollowService({ db, source, logger: testLogger });
  const download = createDownloadService({
    db,
    worker: {
      enqueue: vi.fn(),
      cancel: vi.fn(),
      retry: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    } as never,
    catalog,
    config,
    logger: testLogger,
  });
  const requests = createRequestService({ catalog, resolver, follow, download, config });
  return { requests, catalog };
}

// mock-data: index 0 = Edens Zero (slug edens-zero, malId 1000, anilistId 2000); index 1 =
// Jujutsu Kaisen (slug jujutsu-kaisen). Tutte le entry mock sono Season 1.

describe('RequestService.resolve', () => {
  it('per slug ritorna la entry corrispondente (season 1)', async () => {
    const { requests } = setup();
    const entry = await requests.resolve({ slug: 'jujutsu-kaisen', download: true });
    expect(entry.slug).toBe('jujutsu-kaisen');
    expect(entry.animeId).toBe('mock_anime_1');
    expect(entry.seasonNumber).toBe(1);
  });

  it('per slug inesistente propaga NotFound', async () => {
    const { requests } = setup();
    await expect(requests.resolve({ slug: 'non-esiste', download: true })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('per anilistId/malId trova la entry se gia in cache', async () => {
    const { requests, catalog } = setup();
    // Porta Edens Zero (index 0) in cache.
    await catalog.getBySlug('edens-zero');

    const byAnilist = await requests.resolve({ anilistId: 2000, download: true });
    expect(byAnilist.slug).toBe('edens-zero');

    const byMal = await requests.resolve({ malId: 1000, download: true });
    expect(byMal.slug).toBe('edens-zero');
  });

  it('per id esterno non in cache (senza title) da NotFound', async () => {
    const { requests } = setup();
    await expect(requests.resolve({ anilistId: 999999, download: true })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('per title fa match fuzzy via ricerca', async () => {
    const { requests } = setup();
    const entry = await requests.resolve({ title: 'Jujutsu Kaisen', download: true });
    expect(entry.slug).toBe('jujutsu-kaisen');
    expect(entry.seasonNumber).toBe(1);
  });

  it('per title senza risultati da NotFound', async () => {
    const { requests } = setup();
    await expect(
      requests.resolve({ title: 'zzz-titolo-inesistente-xyz', download: true }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('per title + season inesistente da NotFound (mock ha solo Season 1)', async () => {
    const { requests } = setup();
    await expect(
      requests.resolve({ title: 'Jujutsu Kaisen', season: 2, download: true }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
