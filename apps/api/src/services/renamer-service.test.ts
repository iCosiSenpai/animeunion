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

  it('qualita XQ/XQPLUS: tag nel nome, path distinto dalla sorgente SD (che resta invariato)', () => {
    insertAnime(db, { id: 'a-1', slug: 'naruto', title: 'Naruto' });
    const renamer = makeRenamer(db, { seriesPathSub: '/data/anime' });

    const sd = renamer.computeEpisodePath({
      animeId: 'a-1',
      episodeNumber: 5,
      language: 'SUB_ITA',
    });
    const sdExplicit = renamer.computeEpisodePath({
      animeId: 'a-1',
      episodeNumber: 5,
      language: 'SUB_ITA',
      quality: 'SD',
    });
    const xq = renamer.computeEpisodePath({
      animeId: 'a-1',
      episodeNumber: 5,
      language: 'SUB_ITA',
      quality: 'XQ',
    });
    const xqplus = renamer.computeEpisodePath({
      animeId: 'a-1',
      episodeNumber: 5,
      language: 'SUB_ITA',
      quality: 'XQPLUS',
    });

    // SD (default e esplicito) = percorso storico invariato.
    expect(sd).toBe(join('/data/anime', 'Naruto', 'Season 01', 'Naruto - S01E05 - SUB ITA.mp4'));
    expect(sdExplicit).toBe(sd);
    // Le upscalate prendono un tag qualita' → non sovrascrivono la sorgente ne' fra loro.
    expect(xq).toBe(
      join('/data/anime', 'Naruto', 'Season 01', 'Naruto - S01E05 - SUB ITA [XQ].mp4'),
    );
    expect(xqplus).toBe(
      join('/data/anime', 'Naruto', 'Season 01', 'Naruto - S01E05 - SUB ITA [XQPLUS].mp4'),
    );
    expect(new Set([sd, xq, xqplus]).size).toBe(3);
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

  it('previewPath con override kind=movie: forza il percorso film anche se type=TV', () => {
    insertAnime(db, {
      id: 'ord',
      slug: 'sao-ordinal-scale',
      title: 'SAO Ordinal Scale',
      type: 'TV',
    });
    const renamer = makeRenamer(db, {
      seriesPathSub: '/data/anime',
      moviePathSub: '/data/movies',
      moviePathDub: '/data/movies-dub',
    });

    expect(
      renamer.previewPath({
        animeId: 'ord',
        episodeNumber: 1,
        language: 'SUB_ITA',
        override: { kind: 'movie' },
      }),
    ).toBe(join('/data/movies', 'SAO Ordinal Scale', 'SAO Ordinal Scale.mp4'));
  });

  it('previewPath con override kind=special: cartella Specials, nome S00EXX', () => {
    insertAnime(db, { id: 'ova', slug: 'my-ova', title: 'My OVA' });
    const renamer = makeRenamer(db, {
      seriesPathSub: '/data/anime',
      seriesPathDub: '/data/anime-dub',
    });

    expect(
      renamer.previewPath({
        animeId: 'ova',
        episodeNumber: 2,
        language: 'SUB_ITA',
        override: { kind: 'special' },
      }),
    ).toBe(join('/data/anime', 'My OVA', 'Specials', 'My OVA - S00E02.mp4'));
  });

  it('previewPath: una stagione di sequel finisce nella cartella della serie madre (caso SAO)', () => {
    insertAnime(db, {
      id: 'sao',
      slug: 'sword-art-online',
      title: 'Sword Art Online',
      episodeCount: 25,
    });
    insertAnime(db, {
      id: 'sao-ali',
      slug: 'sword-art-online-alicization',
      title: 'Sword Art Online: Alicization',
      episodeCount: 24,
    });
    const renamer = makeRenamer(db, { seriesPathSub: '/data/anime' });

    // Con serie madre = SAO base + stagione 3 → cartella "Sword Art Online", non "…: Alicization".
    expect(
      renamer.previewPath({
        animeId: 'sao-ali',
        episodeNumber: 1,
        language: 'SUB_ITA',
        override: { seriesAnimeId: 'sao', seasonNumber: 3 },
      }),
    ).toBe(
      join(
        '/data/anime',
        'Sword Art Online',
        'Season 03',
        'Sword Art Online - S03E01 - SUB ITA.mp4',
      ),
    );
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

  it('stagione divisa in part 1/2: numerazione episodi continua (War of Underworld)', () => {
    insertAnime(db, {
      id: 'sao',
      slug: 'sword-art-online',
      title: 'Sword Art Online',
      episodeCount: 25,
    });
    insertAnime(db, {
      id: 'wou1',
      slug: 'sao-alicization-war-of-underworld',
      title: 'SAO Alicization - War of Underworld',
      episodeCount: 12,
    });
    insertAnime(db, {
      id: 'wou2',
      slug: 'sao-alicization-war-of-underworld-2',
      title: 'SAO Alicization - War of Underworld 2',
      episodeCount: 11,
    });
    const ts = new Date().toISOString();
    db.insert(schema.seriesOverride)
      .values([
        {
          animeId: 'wou1',
          seriesAnimeId: 'sao',
          seasonNumber: 4,
          partNumber: 1,
          kind: 'tv',
          updatedAt: ts,
        },
        {
          animeId: 'wou2',
          seriesAnimeId: 'sao',
          seasonNumber: 4,
          partNumber: 2,
          kind: 'tv',
          updatedAt: ts,
        },
      ])
      .run();
    const renamer = makeRenamer(db, { seriesPathSub: '/data/anime' });
    const dir = join('/data/anime', 'Sword Art Online', 'Season 04');

    // Part 1: episodi 1..12 invariati.
    expect(
      renamer.computeEpisodePath({ animeId: 'wou1', episodeNumber: 1, language: 'SUB_ITA' }),
    ).toBe(join(dir, 'Sword Art Online - S04E01 - SUB ITA.mp4'));
    expect(
      renamer.computeEpisodePath({ animeId: 'wou1', episodeNumber: 12, language: 'SUB_ITA' }),
    ).toBe(join(dir, 'Sword Art Online - S04E12 - SUB ITA.mp4'));

    // Part 2 riparte da 1 sul sito → numerazione continua a partire da 13.
    expect(
      renamer.computeEpisodePath({ animeId: 'wou2', episodeNumber: 1, language: 'SUB_ITA' }),
    ).toBe(join(dir, 'Sword Art Online - S04E13 - SUB ITA.mp4'));
    expect(
      renamer.computeEpisodePath({ animeId: 'wou2', episodeNumber: 11, language: 'SUB_ITA' }),
    ).toBe(join(dir, 'Sword Art Online - S04E23 - SUB ITA.mp4'));

    // Se l'entry usa gia' numerazione continua (13) non viene sommato l'offset due volte.
    expect(
      renamer.computeEpisodePath({ animeId: 'wou2', episodeNumber: 13, language: 'SUB_ITA' }),
    ).toBe(join(dir, 'Sword Art Online - S04E13 - SUB ITA.mp4'));
  });

  it('part 2 con conteggio part 1 sconosciuto: nessun offset (fallback)', () => {
    insertAnime(db, { id: 'root', slug: 'root-show', title: 'Root Show', episodeCount: 12 });
    insertAnime(db, { id: 'p1', slug: 'root-show-p1', title: 'Root P1', episodeCount: 0 });
    insertAnime(db, { id: 'p2', slug: 'root-show-p2', title: 'Root P2', episodeCount: 11 });
    const ts = new Date().toISOString();
    db.insert(schema.seriesOverride)
      .values([
        {
          animeId: 'p1',
          seriesAnimeId: 'root',
          seasonNumber: 2,
          partNumber: 1,
          kind: 'tv',
          updatedAt: ts,
        },
        {
          animeId: 'p2',
          seriesAnimeId: 'root',
          seasonNumber: 2,
          partNumber: 2,
          kind: 'tv',
          updatedAt: ts,
        },
      ])
      .run();
    const renamer = makeRenamer(db, { seriesPathSub: '/data/anime' });

    // episodeCount di part 1 sconosciuto (0) → offset 0 → si tiene il numero d'origine.
    expect(
      renamer.computeEpisodePath({ animeId: 'p2', episodeNumber: 1, language: 'SUB_ITA' }),
    ).toBe(join('/data/anime', 'Root Show', 'Season 02', 'Root Show - S02E01 - SUB ITA.mp4'));
  });

  it('stagione 1 divisa: la serie base conta come parte 1 senza override (Sakamoto Days)', () => {
    // La parte 1 e' la serie base stessa (nessun override): solo la parte 2 (il correlato) ha
    // un override. Senza il fix l'offset sarebbe 0 e la parte 2 ripartirebbe da S01E01.
    insertAnime(db, {
      id: 'saka',
      slug: 'sakamoto-days',
      title: 'Sakamoto Days',
      episodeCount: 11,
    });
    insertAnime(db, {
      id: 'saka-2',
      slug: 'sakamoto-days-part-2',
      title: 'Sakamoto Days Parte 2',
      episodeCount: 11,
    });
    const ts = new Date().toISOString();
    db.insert(schema.seriesOverride)
      .values({
        animeId: 'saka-2',
        seriesAnimeId: 'saka',
        seasonNumber: 1,
        partNumber: 2,
        kind: 'tv',
        updatedAt: ts,
      })
      .run();
    const renamer = makeRenamer(db, { seriesPathSub: '/media/Anime' });
    const expected = join(
      '/media/Anime',
      'Sakamoto Days',
      'Season 01',
      'Sakamoto Days - S01E12 - SUB ITA.mp4',
    );

    // Parte 2 ep 1 (il sito riparte da 1) → continua dopo gli 11 episodi della parte 1 → S01E12.
    expect(
      renamer.computeEpisodePath({ animeId: 'saka-2', episodeNumber: 1, language: 'SUB_ITA' }),
    ).toBe(expected);

    // Stessa cosa in anteprima (dialog "Classifica"), prima ancora di salvare l'override.
    expect(
      renamer.previewPath({
        animeId: 'saka-2',
        episodeNumber: 1,
        language: 'SUB_ITA',
        override: { seriesAnimeId: 'saka', seasonNumber: 1, partNumber: 2 },
      }),
    ).toBe(expected);
  });
});
