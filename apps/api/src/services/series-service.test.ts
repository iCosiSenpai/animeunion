import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../db';
import { createTestDb } from '../test/helpers';
import { createSeriesResolver } from './series-resolver';
import { createSeriesService } from './series-service';

function makeService(db: ReturnType<typeof createTestDb>) {
  return createSeriesService({ db, resolver: createSeriesResolver({ db }) });
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
