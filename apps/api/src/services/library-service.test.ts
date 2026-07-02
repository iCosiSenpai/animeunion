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
  status: 'not_downloaded' | 'downloaded' | 'external' = 'not_downloaded',
  localPath: string | null = null,
) {
  const ts = new Date().toISOString();
  db.insert(schema.episodeFile)
    .values({
      id,
      episodeId,
      language,
      downloadStatus: status,
      localPath,
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

  it('checkVanished rileva un episodio scaricato sparito dal disco, lo azzera e lo ritorna', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-v', { title: 'Show V' });
    insertEpisode(db, 'ep-v-1', 'show-v', 1);
    insertEpisode(db, 'ep-v-2', 'show-v', 2);
    const { service, renamer } = makeService(db, tmpDir);
    // ep1: file presente su disco → NON sparito.
    const present = await placeEpisode(renamer, 'show-v', 1, 'SUB_ITA');
    insertFile(db, 'file-v-1', 'ep-v-1', 'SUB_ITA', 'downloaded', present);
    // ep2: marcato downloaded ma il file non c'è (root presente) → sparito.
    const gonePath = join(tmpDir, 'Show V', 'Season 01', 'gone.mp4');
    insertFile(db, 'file-v-2', 'ep-v-2', 'SUB_ITA', 'downloaded', gonePath);

    const vanished = await service.checkVanished();

    expect(vanished).toHaveLength(1);
    expect(vanished[0]?.episodeNumber).toBe(2);
    expect(vanished[0]?.animeTitle).toBe('Show V');
    const gone = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-v-2'))
      .get();
    expect(gone?.downloadStatus).toBe('not_downloaded');
    expect(gone?.localPath).toBeNull();
    const ok = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-v-1'))
      .get();
    expect(ok?.downloadStatus).toBe('downloaded');
  });

  it('checkVanished non tocca nulla se la root e offline (disco staccato)', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-w');
    insertEpisode(db, 'ep-w-1', 'show-w', 1);
    const goneRoot = join(tmpdir(), 'au-gone-root-vanish-xyz-123');
    const { service } = makeService(db, goneRoot); // root inesistente = NAS staccato
    insertFile(db, 'file-w-1', 'ep-w-1', 'SUB_ITA', 'downloaded', join(goneRoot, 'x.mp4'));

    const vanished = await service.checkVanished();

    expect(vanished).toHaveLength(0);
    const row = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-w-1'))
      .get();
    expect(row?.downloadStatus).toBe('downloaded'); // invariato
  });

  it('scan non tocca i file external e la libreria li mostra (niente missing/orfani)', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-x');
    insertEpisode(db, 'ep-x-1', 'show-x', 1);
    // File dell'utente fuori dallo schema renamer ma dentro la root configurata.
    const userFile = join(tmpDir, 'My Anime', 'Season 01', 'My Anime - 01.mkv');
    await mkdir(dirname(userFile), { recursive: true });
    await writeFile(userFile, 'external-bytes'); // 14 byte
    insertFile(db, 'file-x-1', 'ep-x-1', 'SUB_ITA', 'external', userFile);

    const { service } = makeService(db, tmpDir);
    const result = await service.scan();
    expect(result.found).toBe(1);
    expect(result.missing).toBe(0);
    expect(result.orphans).toBe(0);

    // La scan non riscrive lo stato external.
    const row = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-x-1'))
      .get();
    expect(row?.downloadStatus).toBe('external');
    expect(row?.localPath).toBe(userFile);

    // La libreria lo conta come presente, con flag external.
    const groups = service.list();
    expect(groups).toHaveLength(1);
    expect(groups[0]?.entries[0]?.episodes[0]?.external).toBe(true);
    expect(service.stats().totalEpisodes).toBe(1);
  });

  it('scan riconcilia un external sparito dal disco (root presente): reset + mancante', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-x');
    insertEpisode(db, 'ep-x-1', 'show-x', 1);
    // localPath dell'utente dentro la root configurata (tmpDir esiste) ma il file NON c'e' piu'.
    const userFile = join(tmpDir, 'My Anime', 'Season 01', 'My Anime - 01.mkv');
    insertFile(db, 'file-x-1', 'ep-x-1', 'SUB_ITA', 'external', userFile);

    const { service } = makeService(db, tmpDir);
    const result = await service.scan();
    expect(result.missing).toBe(1);
    expect(result.missingEntries.some((m) => m.episodeFileId === 'file-x-1')).toBe(true);

    // Lo stato e' azzerato cosi' puo' essere riscaricato.
    const row = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-x-1'))
      .get();
    expect(row?.downloadStatus).toBe('not_downloaded');
    expect(row?.localPath).toBeNull();
  });

  it('unlinkExternal scollega un external senza toccare il file su disco', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-u');
    insertEpisode(db, 'ep-u-1', 'show-u', 1);
    const userFile = join(tmpDir, 'Mine', 'Season 01', 'Mine - 01.mkv');
    await mkdir(dirname(userFile), { recursive: true });
    await writeFile(userFile, 'external-bytes');
    insertFile(db, 'file-u-1', 'ep-u-1', 'SUB_ITA', 'external', userFile);
    const { service } = makeService(db, tmpDir);

    const res = service.unlinkExternal({ episodeFileId: 'file-u-1' });
    expect(res).toEqual({ ok: true, unlinked: 1 });

    const row = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-u-1'))
      .get();
    expect(row?.downloadStatus).toBe('not_downloaded');
    expect(row?.localPath).toBeNull();
    // Il file dell'utente resta sul disco (mai cancellato dallo scollega).
    expect(existsSync(userFile)).toBe(true);
    // Non è più in libreria.
    expect(service.list()).toHaveLength(0);
  });

  it('unlinkExternal non tocca i file downloaded (no-op di sicurezza)', () => {
    const db = createTestDb();
    insertAnime(db, 'show-d');
    insertEpisode(db, 'ep-d-1', 'show-d', 1);
    insertFile(db, 'file-d-1', 'ep-d-1', 'SUB_ITA', 'downloaded', '/somewhere/x.mp4');
    const { service } = makeService(db, tmpDir);

    const res = service.unlinkExternal({ episodeFileId: 'file-d-1' });
    expect(res).toEqual({ ok: true, unlinked: 0 });
    const row = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-d-1'))
      .get();
    expect(row?.downloadStatus).toBe('downloaded');
    expect(row?.localPath).toBe('/somewhere/x.mp4');
  });

  it('unlinkExternal per-entry scollega gli external della lingua, lascia i downloaded', () => {
    const db = createTestDb();
    insertAnime(db, 'show-m');
    insertEpisode(db, 'ep-m-1', 'show-m', 1);
    insertEpisode(db, 'ep-m-2', 'show-m', 2);
    insertEpisode(db, 'ep-m-3', 'show-m', 3);
    insertFile(db, 'file-m-1', 'ep-m-1', 'SUB_ITA', 'external', join(tmpDir, 'a.mkv'));
    insertFile(db, 'file-m-2', 'ep-m-2', 'SUB_ITA', 'downloaded', join(tmpDir, 'b.mp4'));
    insertFile(db, 'file-m-3', 'ep-m-3', 'DUB_ITA', 'external', join(tmpDir, 'c.mkv'));
    const { service } = makeService(db, tmpDir);
    const statusOf = (id: string) =>
      db.select().from(schema.episodeFile).where(eq(schema.episodeFile.id, id)).get()
        ?.downloadStatus;

    // Solo SUB_ITA: scollega l'unico external SUB, non tocca il downloaded né il DUB external.
    expect(service.unlinkExternal({ animeId: 'show-m', language: 'SUB_ITA' })).toEqual({
      ok: true,
      unlinked: 1,
    });
    expect(statusOf('file-m-1')).toBe('not_downloaded');
    expect(statusOf('file-m-2')).toBe('downloaded');
    expect(statusOf('file-m-3')).toBe('external');

    // Senza language: scollega tutti gli external rimasti (il DUB).
    expect(service.unlinkExternal({ animeId: 'show-m' })).toEqual({ ok: true, unlinked: 1 });
    expect(statusOf('file-m-3')).toBe('not_downloaded');
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

  it('list() unisce SUB e DUB dello stesso anime in un solo gruppo', async () => {
    const db = createTestDb();
    insertAnime(db, 'grp-a');
    insertEpisode(db, 'ep-grp-a-1', 'grp-a', 1);
    insertFile(db, 'file-grp-a-sub', 'ep-grp-a-1', 'SUB_ITA');
    insertFile(db, 'file-grp-a-dub', 'ep-grp-a-1', 'DUB_ITA');
    const { service, renamer } = makeService(db, tmpDir);
    await placeEpisode(renamer, 'grp-a', 1, 'SUB_ITA');
    await placeEpisode(renamer, 'grp-a', 1, 'DUB_ITA');
    await service.scan();

    const groups = service.list();
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g?.category).toBe('tv');
    expect(g?.languages).toEqual(['SUB_ITA', 'DUB_ITA']);
    expect(g?.entries).toHaveLength(2);
    expect(g?.totalEpisodes).toBe(2);
    expect(g?.totalSizeBytes).toBe(20); // 2 file da 10 byte
  });

  it('list() unisce piu stagioni dello stesso seriesId (rappresentativo = stagione base)', async () => {
    const db = createTestDb();
    insertAnime(db, 'saga-s1', { seriesId: 'saga', seasonNumber: 1, title: 'Saga' });
    insertAnime(db, 'saga-s2', { seriesId: 'saga', seasonNumber: 2, title: 'Saga 2' });
    insertEpisode(db, 'ep-saga-s1', 'saga-s1', 1);
    insertEpisode(db, 'ep-saga-s2', 'saga-s2', 1);
    insertFile(db, 'file-saga-s1', 'ep-saga-s1', 'SUB_ITA');
    insertFile(db, 'file-saga-s2', 'ep-saga-s2', 'SUB_ITA');
    const { service, renamer } = makeService(db, tmpDir);
    await placeEpisode(renamer, 'saga-s1', 1, 'SUB_ITA');
    await placeEpisode(renamer, 'saga-s2', 1, 'SUB_ITA');
    await service.scan();

    const groups = service.list();
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g?.seriesId).toBe('saga');
    expect(g?.anime.id).toBe('saga-s1'); // rappresentativo = stagione minore
    const seasons = [...new Set(g?.entries.map((e) => e.seasonNumber))].sort((a, b) => a - b);
    expect(seasons).toEqual([1, 2]);
  });

  it('list() separa i film dalle serie TV in gruppi distinti', async () => {
    const db = createTestDb();
    insertAnime(db, 'movie-x', { type: 'MOVIE' });
    insertAnime(db, 'tv-y', { type: 'TV' });
    insertEpisode(db, 'ep-movie-x', 'movie-x', 1);
    insertEpisode(db, 'ep-tv-y', 'tv-y', 1);
    insertFile(db, 'file-movie-x', 'ep-movie-x', 'SUB_ITA');
    insertFile(db, 'file-tv-y', 'ep-tv-y', 'SUB_ITA');
    const { service, renamer } = makeService(db, tmpDir);
    await placeEpisode(renamer, 'movie-x', 1, 'SUB_ITA');
    await placeEpisode(renamer, 'tv-y', 1, 'SUB_ITA');
    await service.scan();

    const groups = service.list();
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.category === 'film')?.anime.id).toBe('movie-x');
    expect(groups.find((g) => g.category === 'tv')?.anime.id).toBe('tv-y');
  });

  // --- Step 7: Hardening P2 ---

  it('scan() trova file video in sottocartelle annidate (walk ricorsivo)', async () => {
    // Verifica che walk() scenda correttamente nelle sottocartelle. Crea una struttura
    // a 3 livelli di profondità con un file video in fondo, al di fuori dei path attesi
    // dal renamer — il file sarà rilevato come orfano (orphan), ma walk() lo trova.
    const db = createTestDb();
    const { service } = makeService(db, tmpDir);

    const deep = join(tmpDir, 'stagione1', 'sub', 'extra');
    await mkdir(deep, { recursive: true });
    await writeFile(join(deep, 'orphan.mp4'), 'fake-video');

    const result = await service.scan();
    // Il file viene trovato da walk() e classificato come orfano (non tracciato nel DB).
    expect(result.orphans).toBe(1);
  });
});
