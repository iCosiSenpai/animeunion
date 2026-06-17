import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../db';
import { createTestDb } from '../test/helpers';
import { createSeriesResolver } from './series-resolver';

function insertAnime(
  db: ReturnType<typeof createTestDb>,
  values: Partial<typeof schema.anime.$inferInsert> & { id: string; slug: string; title: string },
) {
  const ts = new Date().toISOString();
  db.insert(schema.anime)
    .values({
      type: 'TV',
      status: 'ONGOING',
      episodeCount: 12,
      coverImage: null,
      score: null,
      createdAt: ts,
      updatedAt: ts,
      ...values,
    })
    .run();
}

function insertRelation(
  db: ReturnType<typeof createTestDb>,
  animeId: string,
  relatedAnimeId: string,
  relationType: string,
) {
  db.insert(schema.animeRelation).values({ animeId, relatedAnimeId, relationType }).run();
}

describe('SeriesResolver', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('usa seriesId e seasonNumber quando presenti', () => {
    insertAnime(db, {
      id: 'a-1',
      slug: 'naruto',
      title: 'Naruto',
      seriesId: 'naruto-series',
      seasonNumber: 1,
    });
    insertAnime(db, {
      id: 'a-2',
      slug: 'naruto-shippuden',
      title: 'Naruto Shippuden',
      seriesId: 'naruto-series',
      seasonNumber: 2,
    });

    const resolver = createSeriesResolver({ db });
    const info = resolver.resolve('a-2');

    expect(info).toMatchObject({
      seriesId: 'naruto-series',
      seasonNumber: 2,
      seriesSlug: 'naruto',
    });
  });

  it('ricostruisce stagione dalla catena PREQUEL/SEQUEL', () => {
    insertAnime(db, { id: 's1', slug: 'aot-s1', title: 'Attack on Titan S1' });
    insertAnime(db, { id: 's2', slug: 'aot-s2', title: 'Attack on Titan S2' });
    insertRelation(db, 's2', 's1', 'PREQUEL');
    insertRelation(db, 's1', 's2', 'SEQUEL');

    const resolver = createSeriesResolver({ db });
    expect(resolver.resolve('s1')).toMatchObject({
      seriesId: 's1',
      seasonNumber: 1,
      seriesSlug: 'aot-s1',
    });
    expect(resolver.resolve('s2')).toMatchObject({
      seriesId: 's1',
      seasonNumber: 2,
      seriesSlug: 'aot-s1',
    });
  });

  it('fallback su slug isolato quando mancano dati API e relazioni', () => {
    insertAnime(db, { id: 'solo', slug: 'solo-anime', title: 'Solo Anime' });

    const resolver = createSeriesResolver({ db });
    expect(resolver.resolve('solo')).toMatchObject({
      seriesId: 'solo',
      seasonNumber: 1,
      seriesSlug: 'solo-anime',
    });
  });

  it('gestisce anime non esistente con fallback all id', () => {
    const resolver = createSeriesResolver({ db });
    expect(resolver.resolve('missing')).toMatchObject({
      seriesId: 'missing',
      seasonNumber: 1,
      seriesSlug: 'missing',
    });
  });
});
