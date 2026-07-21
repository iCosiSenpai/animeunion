import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('euristica slug: -2nd-season collega alla serie madre esistente', () => {
    insertAnime(db, { id: 'angel-1', slug: 'otonari-ken', title: 'The Angel S1' });
    insertAnime(db, { id: 'angel-2', slug: 'otonari-ken-2nd-season', title: 'The Angel S2' });

    const resolver = createSeriesResolver({ db });
    expect(resolver.resolve('angel-2')).toMatchObject({
      seriesId: 'angel-1',
      seasonNumber: 2,
      seriesSlug: 'otonari-ken',
    });
  });

  it('euristica slug: -season-3 e numero romano -ii', () => {
    insertAnime(db, { id: 'b1', slug: 'aharen-san-wa-hakarenai', title: 'Aharen' });
    insertAnime(db, { id: 'b3', slug: 'aharen-san-wa-hakarenai-season-3', title: 'Aharen S3' });
    insertAnime(db, { id: 'c1', slug: 'aishen-qiaokeli-ing', title: 'Aishen' });
    insertAnime(db, { id: 'c2', slug: 'aishen-qiaokeli-ing-ii', title: 'Aishen II' });

    const resolver = createSeriesResolver({ db });
    expect(resolver.resolve('b3')).toMatchObject({
      seasonNumber: 3,
      seriesSlug: 'aharen-san-wa-hakarenai',
    });
    expect(resolver.resolve('c2')).toMatchObject({
      seasonNumber: 2,
      seriesSlug: 'aishen-qiaokeli-ing',
    });
  });

  it('euristica slug: trailing -N usa anche la base con suffisso -1', () => {
    insertAnime(db, { id: 'r1', slug: 'aggressive-retsuko-1', title: 'Retsuko 1' });
    insertAnime(db, { id: 'r2', slug: 'aggressive-retsuko-2', title: 'Retsuko 2' });

    const resolver = createSeriesResolver({ db });
    expect(resolver.resolve('r2')).toMatchObject({
      seriesId: 'r1',
      seasonNumber: 2,
      seriesSlug: 'aggressive-retsuko-1',
    });
  });

  it('euristica slug: nessun falso positivo se la base non esiste', () => {
    // "22-7" (idol group) e "attack-no-1" non devono diventare stagioni.
    insertAnime(db, { id: 'x1', slug: '22-7', title: '22/7' });
    insertAnime(db, { id: 'x2', slug: 'attack-no-1', title: 'Attack No.1' });
    insertAnime(db, { id: 'x3', slug: 'standalone-2', title: 'Standalone 2' });

    const resolver = createSeriesResolver({ db });
    expect(resolver.resolve('x1')).toMatchObject({ seriesId: 'x1', seasonNumber: 1 });
    expect(resolver.resolve('x2')).toMatchObject({ seriesId: 'x2', seasonNumber: 1 });
    expect(resolver.resolve('x3')).toMatchObject({ seriesId: 'x3', seasonNumber: 1 });
  });

  it('override manuale vince su euristica e dati API', () => {
    insertAnime(db, { id: 'root', slug: 'my-series', title: 'My Series' });
    insertAnime(db, {
      id: 'spin',
      slug: 'unrelated-spinoff',
      title: 'Spinoff',
      seriesId: 'other',
      seasonNumber: 5,
    });
    const ts = new Date().toISOString();
    db.insert(schema.seriesOverride)
      .values({ animeId: 'spin', seriesAnimeId: 'root', seasonNumber: 3, updatedAt: ts })
      .run();

    const resolver = createSeriesResolver({ db });
    expect(resolver.resolve('spin')).toMatchObject({
      seriesId: 'root',
      seasonNumber: 3,
      seriesSlug: 'my-series',
    });
  });

  it('membersOf usa la stessa identità per dati API, relazioni, slug e override', () => {
    insertAnime(db, {
      id: 'api-1',
      slug: 'api-one',
      title: 'API One',
      seriesId: 'api-series',
      seasonNumber: 1,
    });
    insertAnime(db, {
      id: 'api-2',
      slug: 'api-two',
      title: 'API Two',
      seriesId: 'api-series',
      seasonNumber: 2,
    });

    insertAnime(db, { id: 'rel-1', slug: 'relation-one', title: 'Relation One' });
    insertAnime(db, { id: 'rel-2', slug: 'relation-two', title: 'Relation Two' });
    insertRelation(db, 'rel-2', 'rel-1', 'PREQUEL');
    insertRelation(db, 'rel-1', 'rel-2', 'SEQUEL');

    insertAnime(db, { id: 'slug-1', slug: 'slug-series', title: 'Slug One' });
    insertAnime(db, { id: 'slug-2', slug: 'slug-series-2nd-season', title: 'Slug Two' });

    insertAnime(db, { id: 'override-root', slug: 'override-root', title: 'Override Root' });
    insertAnime(db, { id: 'override-member', slug: 'separate-title', title: 'Override Member' });
    db.insert(schema.seriesOverride)
      .values({
        animeId: 'override-member',
        seriesAnimeId: 'override-root',
        seasonNumber: 2,
        updatedAt: new Date().toISOString(),
      })
      .run();

    insertAnime(db, { id: 'unrelated', slug: 'unrelated', title: 'Unrelated' });

    const resolver = createSeriesResolver({ db });
    expect(resolver.membersOf('api-2')).toEqual(['api-1', 'api-2']);
    expect(resolver.membersOf('rel-2')).toEqual(['rel-1', 'rel-2']);
    expect(resolver.membersOf('slug-2')).toEqual(['slug-1', 'slug-2']);
    expect(resolver.membersOf('override-member')).toEqual(['override-member', 'override-root']);
    expect(resolver.membersOf('unrelated')).toEqual(['unrelated']);
    expect(resolver.membersOf('missing')).toEqual(['missing']);
  });

  it('membersOf usa un numero costante di query indipendente dalla dimensione del catalogo', () => {
    for (let index = 1; index <= 25; index += 1) {
      insertAnime(db, {
        id: `bulk-${index}`,
        slug: `bulk-${index}`,
        title: `Bulk ${index}`,
        seriesId: 'bulk-series',
        seasonNumber: index,
      });
    }
    const resolver = createSeriesResolver({ db });
    const selectSpy = vi.spyOn(db, 'select');

    expect(resolver.membersOf('bulk-20')).toHaveLength(25);
    expect(selectSpy).toHaveBeenCalledTimes(3);
  });
});
