import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../db';
import { createTestDb, testLogger } from '../test/helpers';
import { createConfigService } from './config-service';
import { buildEpisodeNfo, buildSeasonNfo, buildTvshowNfo, createNfoService } from './nfo-service';

describe('NFO builders', () => {
  it('buildTvshowNfo: escaping, rating riscalato, uniqueid e generi', () => {
    const xml = buildTvshowNfo({
      title: 'Tom & Jerry "Show" <b>',
      originalTitle: 'Original',
      plot: 'Trama con & e <tag>',
      studio: 'MAPPA',
      rating: 8.5,
      genres: ['Azione', 'Avventura'],
      malId: 456,
      anilistId: 123,
    });
    expect(xml).toContain('<title>Tom &amp; Jerry &quot;Show&quot; &lt;b&gt;</title>');
    expect(xml).toContain('<plot>Trama con &amp; e &lt;tag&gt;</plot>');
    expect(xml).toContain('<studio>MAPPA</studio>');
    expect(xml).toContain('<rating>8.5</rating>');
    expect(xml).toContain('<genre>Azione</genre>');
    expect(xml).toContain('<genre>Avventura</genre>');
    expect(xml).toContain('<uniqueid type="anilist" default="true">123</uniqueid>');
    expect(xml).toContain('<uniqueid type="mal">456</uniqueid>');
  });

  it('buildTvshowNfo: mal default se manca anilist; campi opzionali assenti', () => {
    const xml = buildTvshowNfo({ title: 'Solo', genres: [], malId: 99 });
    expect(xml).toContain('<uniqueid type="mal" default="true">99</uniqueid>');
    expect(xml).not.toContain('<plot>');
    expect(xml).not.toContain('<rating>');
  });

  it('buildEpisodeNfo e buildSeasonNfo', () => {
    expect(
      buildEpisodeNfo({ title: 'Pilot', season: 1, episode: 3, aired: '2026-01-01' }),
    ).toContain('<episode>3</episode>');
    expect(buildEpisodeNfo({ season: 0, episode: 2 })).toContain('<title>Episodio 2</title>');
    expect(buildSeasonNfo(2)).toContain('<seasonnumber>2</seasonnumber>');
  });
});

describe('NfoService.writeForEpisodeFile', () => {
  let db: ReturnType<typeof createTestDb>;
  let root: string;

  beforeEach(async () => {
    db = createTestDb();
    root = await mkdtemp(join(tmpdir(), 'au-nfo-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function makeService(writeNfo = true) {
    const config = createConfigService({ db });
    config.set('seriesPathSub', root);
    config.set('writeNfo', writeNfo);
    return createNfoService({ db, config, logger: testLogger });
  }

  async function seed(localPath: string, overrides: Record<string, unknown> = {}) {
    const ts = new Date().toISOString();
    db.insert(schema.anime)
      .values({
        id: 'a-1',
        slug: 'show',
        title: 'Show',
        titleIta: 'Show ITA',
        synopsis: 'Trama',
        studio: 'MAPPA',
        score: 85,
        malId: 456,
        anilistId: 123,
        type: 'TV',
        status: 'ONGOING',
        seasonNumber: 1,
        coverImage: null,
        bannerImage: null,
        episodeCount: 1,
        createdAt: ts,
        updatedAt: ts,
        ...overrides,
      })
      .run();
    db.insert(schema.episode)
      .values({
        id: 'e-1',
        animeId: 'a-1',
        number: 1,
        title: 'Pilot',
        airDate: '2026-01-01',
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    db.insert(schema.episodeFile)
      .values({
        id: 'ef-1',
        episodeId: 'e-1',
        language: 'SUB_ITA',
        downloadStatus: 'downloaded',
        localPath,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, 'video');
  }

  it('scrive tvshow/season/episodio per il layout a stagioni', async () => {
    const localPath = join(root, 'Show ITA', 'Season 01', 'Show ITA - S01E01.mp4');
    await seed(localPath);
    await makeService().writeForEpisodeFile('ef-1');

    const tvshow = await readFile(join(root, 'Show ITA', 'tvshow.nfo'), 'utf8');
    expect(tvshow).toContain('<title>Show ITA</title>');
    expect(tvshow).toContain('<originaltitle>Show</originaltitle>');
    expect(tvshow).toContain('<rating>8.5</rating>');
    expect(tvshow).toContain('<uniqueid type="anilist" default="true">123</uniqueid>');

    const season = await readFile(join(root, 'Show ITA', 'Season 01', 'season.nfo'), 'utf8');
    expect(season).toContain('<seasonnumber>1</seasonnumber>');

    const ep = await readFile(join(root, 'Show ITA', 'Season 01', 'Show ITA - S01E01.nfo'), 'utf8');
    expect(ep).toContain('<season>1</season>');
    expect(ep).toContain('<episode>1</episode>');
    expect(ep).toContain('<title>Pilot</title>');
  });

  it('idempotente: non sovrascrive tvshow.nfo esistente, riscrive episodio', async () => {
    const localPath = join(root, 'Show ITA', 'Season 01', 'Show ITA - S01E01.mp4');
    await seed(localPath);
    const tvshowPath = join(root, 'Show ITA', 'tvshow.nfo');
    await mkdir(dirname(tvshowPath), { recursive: true });
    await writeFile(tvshowPath, 'SENTINELLA');

    await makeService().writeForEpisodeFile('ef-1');
    expect(await readFile(tvshowPath, 'utf8')).toBe('SENTINELLA'); // non toccato
    // l'episodio viene comunque scritto
    expect(existsSync(join(root, 'Show ITA', 'Season 01', 'Show ITA - S01E01.nfo'))).toBe(true);
  });

  it('writeNfo off: non scrive nulla', async () => {
    const localPath = join(root, 'Show ITA', 'Season 01', 'Show ITA - S01E01.mp4');
    await seed(localPath);
    await makeService(false).writeForEpisodeFile('ef-1');
    expect(existsSync(join(root, 'Show ITA', 'tvshow.nfo'))).toBe(false);
    expect(existsSync(join(root, 'Show ITA', 'Season 01', 'season.nfo'))).toBe(false);
  });

  it('layout film: tvshow + episodio nella cartella del film, niente season.nfo', async () => {
    const localPath = join(root, 'Film X', 'Film X.mp4');
    await seed(localPath, { type: 'MOVIE' });
    await makeService().writeForEpisodeFile('ef-1');
    expect(existsSync(join(root, 'Film X', 'tvshow.nfo'))).toBe(true);
    expect(existsSync(join(root, 'Film X', 'Film X.nfo'))).toBe(true);
    expect(existsSync(join(root, 'Film X', 'season.nfo'))).toBe(false);
  });

  it('scarica poster/fanart best-effort dagli URL artwork', async () => {
    const img = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]); // finto JPEG
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'image/jpeg' });
      res.end(img);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;

    const localPath = join(root, 'Show ITA', 'Season 01', 'Show ITA - S01E01.mp4');
    await seed(localPath, { coverImage: `${base}/poster.jpg`, bannerImage: `${base}/fanart.jpg` });
    try {
      await makeService().writeForEpisodeFile('ef-1');
      const poster = await readFile(join(root, 'Show ITA', 'poster.jpg'));
      const fanart = await readFile(join(root, 'Show ITA', 'fanart.jpg'));
      expect(poster.equals(img)).toBe(true);
      expect(fanart.equals(img)).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
