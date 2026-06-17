import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../db';
import { createTestDb } from '../test/helpers';
import { createRenamerService } from './renamer-service';

function insertAnime(
  db: ReturnType<typeof createTestDb>,
  values: Partial<typeof schema.anime.$inferInsert> & { id: string; slug: string; title: string },
) {
  const ts = new Date().toISOString();
  db.insert(schema.anime)
    .values({
      type: 'TV',
      status: 'ONGOING',
      episodeCount: values.episodeCount ?? 12,
      coverImage: null,
      score: null,
      createdAt: ts,
      updatedAt: ts,
      ...values,
    })
    .run();
}

describe('RenamerService', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('costruisce path base sub-ita S01E05', () => {
    insertAnime(db, { id: 'a-1', slug: 'naruto', title: 'Naruto' });
    const renamer = createRenamerService({ db });
    const animePath = '/data/anime';

    const path = renamer.computeEpisodePath({
      animeId: 'a-1',
      episodeNumber: 5,
      language: 'SUB_ITA',
      animePath,
    });

    expect(path).toBe(join(animePath, 'sub-ita', 'naruto', 'Season 01', 'S01E05.mp4'));
  });

  it('costruisce path dub-ita', () => {
    insertAnime(db, { id: 'a-1', slug: 'naruto', title: 'Naruto' });
    const renamer = createRenamerService({ db });
    const animePath = '/data/anime';

    const path = renamer.computeEpisodePath({
      animeId: 'a-1',
      episodeNumber: 3,
      language: 'DUB_ITA',
      animePath,
    });

    expect(path).toBe(join(animePath, 'dub-ita', 'naruto', 'Season 01', 'S01E03.mp4'));
  });

  it('usa seriesId/seasonNumber quando presenti e mantiene numero relativo', () => {
    insertAnime(db, {
      id: 's1',
      slug: 'aot-s1',
      title: 'AoT S1',
      seriesId: 'aot',
      seasonNumber: 1,
      episodeCount: 25,
    });
    insertAnime(db, {
      id: 's2',
      slug: 'aot-s2',
      title: 'AoT S2',
      seriesId: 'aot',
      seasonNumber: 2,
      episodeCount: 12,
    });
    const renamer = createRenamerService({ db });
    const animePath = '/data/anime';

    expect(
      renamer.computeEpisodePath({
        animeId: 's2',
        episodeNumber: 1,
        language: 'SUB_ITA',
        animePath,
      }),
    ).toBe(join(animePath, 'sub-ita', 'aot-s1', 'Season 02', 'S02E01.mp4'));
  });

  it('corregge rinumerazione assoluta dei sequel', () => {
    insertAnime(db, {
      id: 's1',
      slug: 'aot-s1',
      title: 'AoT S1',
      seriesId: 'aot',
      seasonNumber: 1,
      episodeCount: 12,
    });
    insertAnime(db, {
      id: 's2',
      slug: 'aot-s2',
      title: 'AoT S2',
      seriesId: 'aot',
      seasonNumber: 2,
      episodeCount: 12,
    });
    const renamer = createRenamerService({ db });
    const animePath = '/data/anime';

    expect(
      renamer.computeEpisodePath({
        animeId: 's2',
        episodeNumber: 13,
        language: 'SUB_ITA',
        animePath,
      }),
    ).toBe(join(animePath, 'sub-ita', 'aot-s1', 'Season 02', 'S02E01.mp4'));
  });

  it('corregge rinumerazione ripartita dei sequel', () => {
    insertAnime(db, {
      id: 's1',
      slug: 'rezero-s1',
      title: 'Re:Zero S1',
      seriesId: 'rezero',
      seasonNumber: 1,
      episodeCount: 25,
    });
    insertAnime(db, {
      id: 's2',
      slug: 'rezero-s2',
      title: 'Re:Zero S2',
      seriesId: 'rezero',
      seasonNumber: 2,
      episodeCount: 25,
    });
    const renamer = createRenamerService({ db });
    const animePath = '/data/anime';

    expect(
      renamer.computeEpisodePath({
        animeId: 's2',
        episodeNumber: 1,
        language: 'SUB_ITA',
        animePath,
      }),
    ).toBe(join(animePath, 'sub-ita', 'rezero-s1', 'Season 02', 'S02E01.mp4'));
  });
});
