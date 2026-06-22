import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Language } from '@animeunion/shared';
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
  language: Language,
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

function makeService(db: ReturnType<typeof createTestDb>, basePath: string) {
  const config = createConfigService({ db });
  config.set('seriesPathSub', basePath);
  const renamer = createRenamerService({ db, config });
  const resolver = createSeriesResolver({ db });
  const service = createLibraryService({ db, config, renamer, resolver, logger: testLogger });
  return { service, renamer };
}

/** Crea il file dell'episodio nel path che il renamer si aspetta (10 byte). */
async function placeEpisode(
  renamer: ReturnType<typeof createRenamerService>,
  animeId: string,
  episodeNumber: number,
  language: Language,
) {
  const path = renamer.computeEpisodePath({ animeId, episodeNumber, language });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, 'fake-video'); // 10 byte
  return path;
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

    const { service, renamer } = makeService(db, tmpDir);
    const file = await placeEpisode(renamer, 'show-a', 1, 'SUB_ITA');

    const result = await service.scan();
    expect(result.found).toBe(1);
    expect(result.orphans).toBe(0);
    expect(result.missing).toBe(0);

    const row = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-a-1'))
      .get();
    expect(row?.downloadStatus).toBe('downloaded');
    expect(row?.localPath).toBe(file);
    expect(row?.fileSize).toBe(10);

    expect(service.list()).toHaveLength(1);
    expect(service.stats()).toEqual({ totalEpisodes: 1, totalSizeBytes: 10, totalSeries: 1 });
  });

  it('segna come mancante un file che era stato cancellato', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-b');
    insertEpisode(db, 'ep-b-1', 'show-b', 1);
    insertFile(db, 'file-b-1', 'ep-b-1', 'SUB_ITA', 'downloaded');

    const { service, renamer } = makeService(db, tmpDir);
    const file = await placeEpisode(renamer, 'show-b', 1, 'SUB_ITA');
    await service.scan();

    await rm(file);
    const result = await service.scan();
    expect(result.found).toBe(0);
    expect(result.missing).toBe(1);
    // I missingEntries portano animeId/episodeFileId per il flusso "Mancanti" (ri-scarica).
    expect(result.missingEntries[0]?.animeId).toBe('show-b');
    expect(result.missingEntries[0]?.episodeFileId).toBe('file-b-1');

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

    const { service, renamer } = makeService(db, tmpDir);
    await placeEpisode(renamer, 'show-c', 1, 'SUB_ITA');
    // File non atteso da nessun episode_file → orfano.
    const orphanDir = join(tmpDir, 'Sconosciuto', 'Season 01');
    await mkdir(orphanDir, { recursive: true });
    await writeFile(join(orphanDir, 'Random - S01E99.mp4'), 'orphan');

    const result = await service.scan();
    expect(result.orphans).toBe(1);
    expect(result.orphanPaths[0]).toContain('S01E99');
  });

  it('restituisce lista e stats vuote se non ci sono download', () => {
    const db = createTestDb();
    const { service } = makeService(db, tmpDir);
    expect(service.list()).toEqual([]);
    expect(service.stats()).toEqual({ totalEpisodes: 0, totalSizeBytes: 0, totalSeries: 0 });
  });

  it('deleteEpisodeFile cancella il file, azzera la riga, pulisce coda e cartelle', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-d');
    insertEpisode(db, 'ep-d-1', 'show-d', 1);
    insertFile(db, 'file-d-1', 'ep-d-1', 'SUB_ITA');
    const { service, renamer } = makeService(db, tmpDir);
    const file = await placeEpisode(renamer, 'show-d', 1, 'SUB_ITA');
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
    expect(res).toEqual({ deletedFiles: 1, freedBytes: 10, failedFiles: 0 });
    expect(existsSync(file)).toBe(false);
    // cartelle vuote ripulite (serie/Season).
    expect(existsSync(join(tmpDir, 'show-d', 'Season 01'))).toBe(false);
    expect(existsSync(join(tmpDir, 'show-d'))).toBe(false);

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
    const { service, renamer } = makeService(db, tmpDir);
    await placeEpisode(renamer, 'show-e', 1, 'SUB_ITA');
    const dub = await placeEpisode(renamer, 'show-e', 1, 'DUB_ITA');
    await service.scan();

    const res = await service.deleteEntry({ animeId: 'show-e', language: 'SUB_ITA' });
    expect(res.deletedFiles).toBe(1);
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

  it('deleteEntry con deleteFolder rimuove anche i file non tracciati nella cartella', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-f');
    insertEpisode(db, 'ep-f-1', 'show-f', 1);
    insertFile(db, 'file-f-sub', 'ep-f-1', 'SUB_ITA');
    const { service, renamer } = makeService(db, tmpDir);
    const tracked = await placeEpisode(renamer, 'show-f', 1, 'SUB_ITA');
    await service.scan();
    // File extra NON tracciato nella stessa cartella serie (es. una sigla in Specials).
    const seriesDir = join(tmpDir, 'show-f');
    const extra = join(seriesDir, 'Specials', 'OP1.mp4');
    await mkdir(dirname(extra), { recursive: true });
    await writeFile(extra, 'op-bytes');

    const res = await service.deleteEntry({
      animeId: 'show-f',
      language: 'SUB_ITA',
      deleteFolder: true,
    });
    expect(existsSync(tracked)).toBe(false);
    expect(existsSync(extra)).toBe(false);
    expect(existsSync(seriesDir)).toBe(false);
    expect(res.deletedFiles).toBeGreaterThanOrEqual(2); // tracciato + extra
    expect(res.failedFiles).toBe(0);
  });

  it('deleteOrphans cancella i file orfani indicati', async () => {
    const db = createTestDb();
    const { service } = makeService(db, tmpDir);
    const orphanDir = join(tmpDir, 'Ghost', 'Season 01');
    await mkdir(orphanDir, { recursive: true });
    const orphan = join(orphanDir, 'Ghost - S01E99.mp4');
    await writeFile(orphan, 'orphan-bytes');

    const res = await service.deleteOrphans([orphan]);
    expect(res.deletedFiles).toBe(1);
    expect(res.freedBytes).toBe('orphan-bytes'.length);
    expect(existsSync(orphan)).toBe(false);
  });

  it('deleteSeries cancella tutte le lingue della serie', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-s');
    insertEpisode(db, 'ep-s-1', 'show-s', 1);
    insertFile(db, 'file-s-sub', 'ep-s-1', 'SUB_ITA');
    insertFile(db, 'file-s-dub', 'ep-s-1', 'DUB_ITA');
    const { service, renamer } = makeService(db, tmpDir);
    await placeEpisode(renamer, 'show-s', 1, 'SUB_ITA');
    await placeEpisode(renamer, 'show-s', 1, 'DUB_ITA');
    await service.scan();

    const res = await service.deleteSeries({ animeId: 'show-s' });
    expect(res.deletedFiles).toBe(2);
    const downloaded = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.downloadStatus, 'downloaded'))
      .all();
    expect(downloaded).toHaveLength(0);
  });
});
