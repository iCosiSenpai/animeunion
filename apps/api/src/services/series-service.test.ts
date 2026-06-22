import type { AnimeDetail, RelatedAnime } from '@animeunion/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../db';
import { createTestDb } from '../test/helpers';
import type { CatalogService } from './catalog-service';
import { createConfigService } from './config-service';
import { createRenamerService } from './renamer-service';
import { createSeriesResolver } from './series-resolver';
import { createSeriesService } from './series-service';

const stubCatalog = {
  getBySlug: async () => {
    throw new Error('catalog non usato in questo test');
  },
} as unknown as CatalogService;

function makeService(db: ReturnType<typeof createTestDb>, catalog: CatalogService = stubCatalog) {
  const resolver = createSeriesResolver({ db });
  const config = createConfigService({ db });
  const renamer = createRenamerService({ db, config, seriesResolver: resolver });
  return createSeriesService({ db, resolver, catalog, renamer, config });
}

function rel(id: string, relationType: string): RelatedAnime {
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

function detail(id: string, relatedAnime: RelatedAnime[]): AnimeDetail {
  return { id, slug: id, relatedAnime } as unknown as AnimeDetail;
}

function fakeCatalog(map: Record<string, AnimeDetail>, calls: string[]): CatalogService {
  return {
    async getBySlug(slug: string) {
      calls.push(slug);
      const d = map[slug];
      if (!d) {
        throw new Error(`not found: ${slug}`);
      }
      return d;
    },
  } as unknown as CatalogService;
}

function insertAnime(db: ReturnType<typeof createTestDb>, id: string, slug = id) {
  const ts = new Date().toISOString();
  db.insert(schema.anime)
    .values({
      id,
      slug,
      title: id,
      type: 'TV',
      status: 'ONGOING',
      episodeCount: 12,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
}

function insertFile(
  db: ReturnType<typeof createTestDb>,
  fileId: string,
  animeId: string,
  status: 'not_downloaded' | 'downloaded',
) {
  const ts = new Date().toISOString();
  db.insert(schema.episode)
    .values({ id: `${fileId}-ep`, animeId, number: 1, createdAt: ts, updatedAt: ts })
    .run();
  db.insert(schema.episodeFile)
    .values({
      id: fileId,
      episodeId: `${fileId}-ep`,
      language: 'SUB_ITA',
      downloadStatus: status,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
}

describe('SeriesService.confirmed', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    db = createTestDb();
  });

  it('confirmed=false senza override ne download', () => {
    insertAnime(db, 'a-1');
    expect(makeService(db).getResolved('a-1').confirmed).toBe(false);
  });

  it('confirmed=true dopo setOverride (anche stagione 0)', () => {
    insertAnime(db, 'a-1');
    const service = makeService(db);
    const res = service.setOverride({ animeId: 'a-1', seasonNumber: 0 });
    expect(res.seasonNumber).toBe(0);
    expect(res.confirmed).toBe(true);
    expect(service.getResolved('a-1').confirmed).toBe(true);
  });

  it('setOverride rifiuta la serie madre uguale a se stessa', () => {
    insertAnime(db, 'a-1');
    expect(() => makeService(db).setOverride({ animeId: 'a-1', seriesAnimeId: 'a-1' })).toThrow(
      /se stessa/i,
    );
  });

  it('setOverride rifiuta un 2-ciclo tra le serie madri', () => {
    insertAnime(db, 'a-1');
    insertAnime(db, 'a-2');
    const service = makeService(db);
    service.setOverride({ animeId: 'a-1', seriesAnimeId: 'a-2', seasonNumber: 2 });
    expect(() =>
      service.setOverride({ animeId: 'a-2', seriesAnimeId: 'a-1', seasonNumber: 2 }),
    ).toThrow(/ciclo/i);
  });

  it('previewPath ritorna il percorso e il kind effettivo (override movie)', () => {
    insertAnime(db, 'mov', 'mov');
    const resolver = createSeriesResolver({ db });
    const config = createConfigService({ db });
    config.set('seriesPathSub', '/data/anime');
    config.set('moviePathSub', '/data/movies');
    config.set('moviePathDub', '/data/movies-dub');
    const renamer = createRenamerService({ db, config, seriesResolver: resolver });
    const service = createSeriesService({ db, resolver, catalog: stubCatalog, renamer, config });

    const res = service.previewPath({ animeId: 'mov', kind: 'movie' });
    expect(res.kind).toBe('movie');
    expect(res.path).toContain('movies');
  });

  it('confirmed=true se un episodio risulta gia scaricato', () => {
    insertAnime(db, 'a-1');
    insertFile(db, 'ef-1', 'a-1', 'downloaded');
    expect(makeService(db).getResolved('a-1').confirmed).toBe(true);
  });

  it('confirmed=true se esiste una riga in coda per la serie', () => {
    insertAnime(db, 'a-1');
    insertFile(db, 'ef-1', 'a-1', 'not_downloaded');
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-1',
        episodeFileId: 'ef-1',
        status: 'queued',
        priority: 50,
        createdAt: new Date().toISOString(),
      })
      .run();
    expect(makeService(db).getResolved('a-1').confirmed).toBe(true);
  });
});

describe('SeriesService.franchise', () => {
  it('scopre transitivamente le stagioni e fa fetch+cache dei nodi intermedi', async () => {
    const db = createTestDb();
    const calls: string[] = [];
    const map = {
      s1: detail('s1', [rel('s2', 'SEQUEL')]),
      s2: detail('s2', [rel('s1', 'PREQUEL'), rel('s3', 'SEQUEL')]),
      s3: detail('s3', [rel('s2', 'PREQUEL')]),
    };
    const res = await makeService(db, fakeCatalog(map, calls)).franchise('s1');

    expect(res.map((r) => r.slug).sort()).toEqual(['s2', 's3']);
    // fetch-and-cache: getBySlug chiamato anche per i nodi intermedi (s3 emerge via s2)
    expect(calls).toContain('s1');
    expect(calls).toContain('s2');
    expect(calls).toContain('s3');
  });

  it('non segue relazioni fuori dal franchise (ALTERNATIVE)', async () => {
    const db = createTestDb();
    const calls: string[] = [];
    const map = {
      s1: detail('s1', [rel('alt', 'ALTERNATIVE')]),
      alt: detail('alt', []),
    };
    const res = await makeService(db, fakeCatalog(map, calls)).franchise('s1');

    expect(res).toHaveLength(0);
    expect(calls).not.toContain('alt');
  });

  it('rispetta maxNodes (non espande oltre il limite)', async () => {
    const db = createTestDb();
    const calls: string[] = [];
    const map = {
      s1: detail('s1', [rel('s2', 'SEQUEL')]),
      s2: detail('s2', [rel('s3', 'SEQUEL')]),
      s3: detail('s3', [rel('s4', 'SEQUEL')]),
      s4: detail('s4', []),
    };
    const res = await makeService(db, fakeCatalog(map, calls)).franchise('s1', 2);

    expect(res.map((r) => r.slug)).not.toContain('s4');
    expect(calls).not.toContain('s4');
  });
});
