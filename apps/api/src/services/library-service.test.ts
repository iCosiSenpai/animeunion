import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../db';
import { createTestDb, testLogger } from '../test/helpers';
import { createConfigService } from './config-service';
import { createLibraryService } from './library-service';
import { createRenamerService } from './renamer-service';
import { createSeriesResolver } from './series-resolver';

function insertAnime(
  db: ReturnType<typeof createTestDb>,
  id: string,
  overrides: Partial<typeof schema.anime.$inferInsert> = {},
) {
  const ts = new Date().toISOString();
  db.insert(schema.anime)
    .values({
      id,
      slug: id,
      title: id,
      titleIta: null,
      type: 'TV',
      status: 'ONGOING',
      coverImage: null,
      episodeCount: 2,
      seriesId: id,
      seasonNumber: 1,
      createdAt: ts,
      updatedAt: ts,
      ...overrides,
    })
    .run();
}

function insertEpisode(
  db: ReturnType<typeof createTestDb>,
  id: string,
  animeId: string,
  number: number,
) {
  const ts = new Date().toISOString();
  db.insert(schema.episode)
    .values({
      id,
      animeId,
      number,
      title: `Ep ${number}`,
      titleIta: null,
      thumbnail: null,
      duration: null,
      airDate: null,
      isFiller: 0,
      languages: 'SUB_ITA',
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
}

function insertFile(
  db: ReturnType<typeof createTestDb>,
  id: string,
  episodeId: string,
  language: 'SUB_ITA' | 'DUB_ITA',
  status: 'not_downloaded' | 'downloaded' = 'not_downloaded',
) {
  const ts = new Date().toISOString();
  db.insert(schema.episodeFile)
    .values({
      id,
      episodeId,
      language,
      downloadStatus: status,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
}

function makeService(db: ReturnType<typeof createTestDb>, animePath: string) {
  const config = createConfigService({ db });
  config.set('animePath', animePath);
  const renamer = createRenamerService({ db });
  const resolver = createSeriesResolver({ db });
  return createLibraryService({ db, config, renamer, resolver, logger: testLogger });
}

async function makeLibraryFile(base: string, slug: string, episode: number, language: string) {
  const lang = language.toLowerCase().replace(/_/g, '-');
  const dir = join(base, lang, slug, 'Season 01');
  await mkdir(dir, { recursive: true });
  const file = join(dir, `S01E${String(episode).padStart(2, '0')}.mp4`);
  await writeFile(file, 'fake-video');
  return file;
}

describe('LibraryService', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'au-library-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('trova un file atteso e aggiorna episode_file', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-a');
    insertEpisode(db, 'ep-a-1', 'show-a', 1);
    insertFile(db, 'file-a-1', 'ep-a-1', 'SUB_ITA');

    const file = await makeLibraryFile(tmpDir, 'show-a', 1, 'SUB_ITA');
    const service = makeService(db, tmpDir);

    const result = await service.scan();
    expect(result).toEqual({
      found: 1,
      updated: 1,
      orphans: 0,
      missing: 0,
      orphanPaths: [],
      missingEntries: [],
    });

    const row = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-a-1'))
      .get();
    expect(row?.downloadStatus).toBe('downloaded');
    expect(row?.localPath).toBe(file);
    expect(row?.fileSize).toBe(10);

    const list = service.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.episodes).toHaveLength(1);
    expect(list[0]?.episodes[0]?.episodeNumber).toBe(1);

    const stats = service.stats();
    expect(stats.totalEpisodes).toBe(1);
    expect(stats.totalSizeBytes).toBe(10);
    expect(stats.totalSeries).toBe(1);
  });

  it('segna come mancante un file che era stato cancellato', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-b');
    insertEpisode(db, 'ep-b-1', 'show-b', 1);
    insertFile(db, 'file-b-1', 'ep-b-1', 'SUB_ITA', 'downloaded');

    const file = await makeLibraryFile(tmpDir, 'show-b', 1, 'SUB_ITA');
    const service = makeService(db, tmpDir);
    await service.scan();

    await rm(file);
    const result = await service.scan();
    expect(result.found).toBe(0);
    expect(result.missing).toBe(1);
    expect(result.updated).toBe(1);

    const row = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-b-1'))
      .get();
    expect(row?.downloadStatus).toBe('not_downloaded');
    expect(row?.localPath).toBeNull();
  });

  it('riporta i file orfani', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-c');
    insertEpisode(db, 'ep-c-1', 'show-c', 1);
    insertFile(db, 'file-c-1', 'ep-c-1', 'SUB_ITA');

    await makeLibraryFile(tmpDir, 'show-c', 1, 'SUB_ITA');
    const orphanDir = join(tmpDir, 'sub-ita', 'show-c', 'Season 01');
    await writeFile(join(orphanDir, 'S01E99.mp4'), 'orphan');

    const service = makeService(db, tmpDir);
    const result = await service.scan();
    expect(result.orphans).toBe(1);
    expect(result.orphanPaths).toHaveLength(1);
    expect(result.orphanPaths[0]).toContain('S01E99.mp4');
  });

  it('restituisce lista e stats vuote se non ci sono download', () => {
    const db = createTestDb();
    const service = makeService(db, tmpDir);
    expect(service.list()).toEqual([]);
    expect(service.stats()).toEqual({ totalEpisodes: 0, totalSizeBytes: 0, totalSeries: 0 });
  });

  it('deleteEpisodeFile cancella il file, azzera la riga, pulisce coda e cartelle', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-d');
    insertEpisode(db, 'ep-d-1', 'show-d', 1);
    insertFile(db, 'file-d-1', 'ep-d-1', 'SUB_ITA');
    const file = await makeLibraryFile(tmpDir, 'show-d', 1, 'SUB_ITA');
    const service = makeService(db, tmpDir);
    await service.scan();
    db.insert(schema.downloadQueue)
      .values({
        id: 'q-d',
        episodeFileId: 'file-d-1',
        status: 'completed',
        priority: 50,
        createdAt: new Date().toISOString(),
      })
      .run();

    const res = await service.deleteEpisodeFile('file-d-1');
    expect(res).toEqual({ deletedFiles: 1, freedBytes: 10 });
    expect(existsSync(file)).toBe(false);
    // cartelle vuote ripulite fino ad animePath
    expect(existsSync(join(tmpDir, 'sub-ita', 'show-d', 'Season 01'))).toBe(false);
    expect(existsSync(join(tmpDir, 'sub-ita'))).toBe(false);

    const row = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-d-1'))
      .get();
    expect(row?.downloadStatus).toBe('not_downloaded');
    expect(row?.localPath).toBeNull();
    expect(db.select().from(schema.downloadQueue).all()).toHaveLength(0);
  });

  it('deleteEntry cancella solo i file della lingua indicata', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-e');
    insertEpisode(db, 'ep-e-1', 'show-e', 1);
    insertFile(db, 'file-e-sub', 'ep-e-1', 'SUB_ITA');
    insertFile(db, 'file-e-dub', 'ep-e-1', 'DUB_ITA');
    await makeLibraryFile(tmpDir, 'show-e', 1, 'SUB_ITA');
    const dub = await makeLibraryFile(tmpDir, 'show-e', 1, 'DUB_ITA');
    const service = makeService(db, tmpDir);
    await service.scan();

    const res = await service.deleteEntry({ animeId: 'show-e', language: 'SUB_ITA' });
    expect(res.deletedFiles).toBe(1);
    expect(existsSync(join(tmpDir, 'sub-ita'))).toBe(false);
    expect(existsSync(dub)).toBe(true); // DUB intatto

    const subRow = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-e-sub'))
      .get();
    const dubRow = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-e-dub'))
      .get();
    expect(subRow?.downloadStatus).toBe('not_downloaded');
    expect(dubRow?.downloadStatus).toBe('downloaded');
  });

  it('deleteSeries cancella tutte le lingue della serie', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-s');
    insertEpisode(db, 'ep-s-1', 'show-s', 1);
    insertFile(db, 'file-s-sub', 'ep-s-1', 'SUB_ITA');
    insertFile(db, 'file-s-dub', 'ep-s-1', 'DUB_ITA');
    await makeLibraryFile(tmpDir, 'show-s', 1, 'SUB_ITA');
    await makeLibraryFile(tmpDir, 'show-s', 1, 'DUB_ITA');
    const service = makeService(db, tmpDir);
    await service.scan();

    const res = await service.deleteSeries({ animeId: 'show-s' });
    expect(res.deletedFiles).toBe(2);
    expect(existsSync(join(tmpDir, 'sub-ita'))).toBe(false);
    expect(existsSync(join(tmpDir, 'dub-ita'))).toBe(false);
    const downloaded = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.downloadStatus, 'downloaded'))
      .all();
    expect(downloaded).toHaveLength(0);
  });
});
