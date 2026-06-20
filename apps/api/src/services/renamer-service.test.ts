import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../db';
import { createTestDb } from '../test/helpers';
import { createConfigService } from './config-service';
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

function makeRenamer(
  db: ReturnType<typeof createTestDb>,
  paths: Partial<
    Record<'seriesPathSub' | 'seriesPathDub' | 'moviePathSub' | 'moviePathDub', string>
  >,
) {
  const config = createConfigService({ db });
  config.set('seriesPathSub', paths.seriesPathSub ?? '/data/anime');
  if (paths.seriesPathDub !== undefined) config.set('seriesPathDub', paths.seriesPathDub);
  if (paths.moviePathSub !== undefined) config.set('moviePathSub', paths.moviePathSub);
  if (paths.moviePathDub !== undefined) config.set('moviePathDub', paths.moviePathDub);
  return createRenamerService({ db, config });
}

describe('RenamerService', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('layout Jellyfin con titolo leggibile; suffisso lingua se SUB e DUB condividono la root', () => {
    insertAnime(db, { id: 'a-1', slug: 'naruto', title: 'Naruto' });
    const renamer = makeRenamer(db, { seriesPathSub: '/data/anime' }); // unica root → suffisso

    expect(
      renamer.computeEpisodePath({ animeId: 'a-1', episodeNumber: 5, language: 'SUB_ITA' }),
    ).toBe(join('/data/anime', 'Naruto', 'Season 01', 'Naruto - S01E05 - SUB ITA.mp4'));
  });

  it('cartelle separate SUB/DUB → nomi puliti, root corretta', () => {
    insertAnime(db, { id: 'a-1', slug: 'naruto', title: 'Naruto' });
    const renamer = makeRenamer(db, {
      seriesPathSub: '/data/anime',
      seriesPathDub: '/data/anime-dub',
    });

    expect(
      renamer.computeEpisodePath({ animeId: 'a-1', episodeNumber: 3, language: 'DUB_ITA' }),
    ).toBe(join('/data/anime-dub', 'Naruto', 'Season 01', 'Naruto - S01E03.mp4'));
  });

  it('film: cartella film separata, nessuna Season', () => {
    insertAnime(db, { id: 'm-1', slug: 'suzume', title: 'Suzume no Tojimari', type: 'MOVIE' });
    const renamer = makeRenamer(db, {
      seriesPathSub: '/data/anime',
      moviePathSub: '/data/movies',
      moviePathDub: '/data/movies-dub',
    });

    expect(
      renamer.computeEpisodePath({ animeId: 'm-1', episodeNumber: 1, language: 'SUB_ITA' }),
    ).toBe(join('/data/movies', 'Suzume no Tojimari', 'Suzume no Tojimari.mp4'));
  });

  it('serie multi-stagione: cartella del franchise + numero relativo (fix sequel)', () => {
    insertAnime(db, {
      id: 's1',
      slug: 'aot-s1',
      title: 'Attack on Titan',
      seriesId: 'aot',
      seasonNumber: 1,
      episodeCount: 25,
    });
    insertAnime(db, {
      id: 's2',
      slug: 'aot-s2',
      title: 'Attack on Titan S2',
      seriesId: 'aot',
      seasonNumber: 2,
      episodeCount: 12,
    });
    const renamer = makeRenamer(db, {
      seriesPathSub: '/data/anime',
      seriesPathDub: '/data/anime-dub',
    });

    // ep assoluto 26 → Season 02 E01, cartella = titolo della stagione root.
    expect(
      renamer.computeEpisodePath({ animeId: 's2', episodeNumber: 26, language: 'SUB_ITA' }),
    ).toBe(join('/data/anime', 'Attack on Titan', 'Season 02', 'Attack on Titan - S02E01.mp4'));
  });

  it('special (stagione 0 via override): cartella Specials, nome S00EXX', () => {
    insertAnime(db, { id: 'sp', slug: 'my-show', title: 'My Show' });
    const ts = new Date().toISOString();
    db.insert(schema.seriesOverride)
      .values({ animeId: 'sp', seriesAnimeId: null, seasonNumber: 0, updatedAt: ts })
      .run();
    const renamer = makeRenamer(db, {
      seriesPathSub: '/data/anime',
      seriesPathDub: '/data/anime-dub',
    });

    expect(
      renamer.computeEpisodePath({ animeId: 'sp', episodeNumber: 2, language: 'SUB_ITA' }),
    ).toBe(join('/data/anime', 'My Show', 'Specials', 'My Show - S00E02.mp4'));
  });

  it('sequel via euristica slug: usa titolo e cartella della serie madre, Season 02', () => {
    // L'API non fornisce seriesId/relazioni: solo lo slug "-2nd-season".
    insertAnime(db, {
      id: 'angel-1',
      slug: 'otonari-ken',
      title: 'Otonari no Tenshi-sama',
      titleIta: 'The Angel Next Door Spoils Me Rotten',
      episodeCount: 0,
    });
    insertAnime(db, {
      id: 'angel-2',
      slug: 'otonari-ken-2nd-season',
      title: 'Otonari no Tenshi-sama 2nd Season',
      titleIta: 'The Angel Next Door Spoils Me Rotten 2',
      episodeCount: 12,
    });
    const renamer = makeRenamer(db, {
      seriesPathSub: '/media/Anime',
      seriesPathDub: '/media/Anime ITA',
    });

    // Episodio 1 (il sito riparte da 1) → Season 02 E01, cartella = titolo della radice (senza "2").
    expect(
      renamer.computeEpisodePath({ animeId: 'angel-2', episodeNumber: 1, language: 'SUB_ITA' }),
    ).toBe(
      join(
        '/media/Anime',
        'The Angel Next Door Spoils Me Rotten',
        'Season 02',
        'The Angel Next Door Spoils Me Rotten - S02E01.mp4',
      ),
    );
  });
});
