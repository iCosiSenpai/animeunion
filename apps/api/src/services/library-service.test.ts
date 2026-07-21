import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Language } from '@animeunion/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../db';
import type { moveToTrash } from '../lib/trash';
import { createTestDb, testLogger } from '../test/helpers';
import { createConfigService } from './config-service';
import { createFileManagerService } from './file-manager-service';
import { createFileMutationCoordinator } from './file-mutation-coordinator';
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

function makeService(
  db: ReturnType<typeof createTestDb>,
  basePath: string,
  moveToTrashImpl?: typeof moveToTrash,
) {
  const config = createConfigService({ db });
  config.set('seriesPathSub', basePath);
  const renamer = createRenamerService({ db, config });
  const resolver = createSeriesResolver({ db });
  const coordinator = createFileMutationCoordinator();
  const service = createLibraryService({
    db,
    config,
    renamer,
    resolver,
    logger: testLogger,
    coordinator,
    ...(moveToTrashImpl ? { moveToTrashImpl } : {}),
  });
  const files = createFileManagerService({
    db,
    config,
    renamer,
    logger: testLogger,
    coordinator,
  });
  return { service, files, renamer, config, coordinator };
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

    const res = await service.unlinkExternal({ episodeFileId: 'file-u-1' });
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

  it('unlinkExternal non tocca i file downloaded (no-op di sicurezza)', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-d');
    insertEpisode(db, 'ep-d-1', 'show-d', 1);
    insertFile(db, 'file-d-1', 'ep-d-1', 'SUB_ITA', 'downloaded', '/somewhere/x.mp4');
    const { service } = makeService(db, tmpDir);

    const res = await service.unlinkExternal({ episodeFileId: 'file-d-1' });
    expect(res).toEqual({ ok: true, unlinked: 0 });
    const row = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-d-1'))
      .get();
    expect(row?.downloadStatus).toBe('downloaded');
    expect(row?.localPath).toBe('/somewhere/x.mp4');
  });

  it('unlinkExternal per-entry scollega gli external della lingua, lascia i downloaded', async () => {
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
    expect(await service.unlinkExternal({ animeId: 'show-m', language: 'SUB_ITA' })).toEqual({
      ok: true,
      unlinked: 1,
    });
    expect(statusOf('file-m-1')).toBe('not_downloaded');
    expect(statusOf('file-m-2')).toBe('downloaded');
    expect(statusOf('file-m-3')).toBe('external');

    // Senza language: scollega tutti gli external rimasti (il DUB).
    expect(await service.unlinkExternal({ animeId: 'show-m' })).toEqual({ ok: true, unlinked: 1 });
    expect(statusOf('file-m-3')).toBe('not_downloaded');
  });

  it('serializza unlinkExternal dopo linkExternalFolder già accodato', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-unlink-race');
    insertEpisode(db, 'ep-unlink-race', 'show-unlink-race', 1);
    const season = join(tmpDir, 'External', 'Season 01');
    const external = join(season, 'Show - S01E01.mkv');
    await mkdir(season, { recursive: true });
    await writeFile(external, 'external-video');
    insertFile(db, 'file-unlink-race', 'ep-unlink-race', 'SUB_ITA', 'external', external);
    const { service, files, coordinator } = makeService(db, tmpDir);

    let enter = () => {};
    let release = () => {};
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = coordinator.runExclusive(async () => {
      enter();
      await released;
    });
    await entered;

    // L'ordine autorevole è link -> unlink. Senza coordinamento di unlink, quest'ultimo correrebbe
    // subito durante il blocker e il link successivo lascerebbe erroneamente lo stato external.
    const link = files.linkExternalFolder(season, 'show-unlink-race', 'SUB_ITA');
    const unlink = service.unlinkExternal({ episodeFileId: 'file-unlink-race' });
    release();
    await blocker;
    expect(await link).toMatchObject({ linked: 1 });
    expect(await unlink).toEqual({ ok: true, unlinked: 1 });

    const row = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-unlink-race'))
      .get();
    expect(row?.downloadStatus).toBe('not_downloaded');
    expect(row?.localPath).toBeNull();
    expect(existsSync(external)).toBe(true);
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

  it('deleteEpisodeFile e deleteOrphans non cancellano mai un file external', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-protected-direct');
    insertEpisode(db, 'ep-protected-direct', 'show-protected-direct', 1);
    const userFile = join(tmpDir, 'User files', 'external.mkv');
    await mkdir(dirname(userFile), { recursive: true });
    await writeFile(userFile, 'external-bytes');
    insertFile(db, 'file-protected-direct', 'ep-protected-direct', 'SUB_ITA', 'external', userFile);
    const { service } = makeService(db, tmpDir);

    expect(await service.deleteEpisodeFile('file-protected-direct')).toEqual({
      deletedFiles: 0,
      freedBytes: 0,
      failedFiles: 0,
      protectedExternalFiles: 1,
    });
    expect(await service.deleteOrphans([userFile])).toEqual({
      deletedFiles: 0,
      freedBytes: 0,
      failedFiles: 0,
      protectedExternalFiles: 1,
    });
    expect(existsSync(userFile)).toBe(true);
    const row = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-protected-direct'))
      .get();
    expect(row?.downloadStatus).toBe('external');
    expect(row?.localPath).toBe(userFile);
  });

  it('deleteEntry con deleteFolder preserva la cartella che contiene un external', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-protected-folder');
    insertEpisode(db, 'ep-protected-downloaded', 'show-protected-folder', 1);
    insertEpisode(db, 'ep-protected-external', 'show-protected-folder', 2);
    const { service, renamer, config } = makeService(db, tmpDir);
    config.set('trashEnabled', false);
    const downloaded = await placeEpisode(renamer, 'show-protected-folder', 1, 'SUB_ITA');
    const external = join(dirname(downloaded), 'user-external.mkv');
    await writeFile(external, 'external-bytes');
    insertFile(
      db,
      'file-protected-downloaded',
      'ep-protected-downloaded',
      'SUB_ITA',
      'downloaded',
      downloaded,
    );
    insertFile(
      db,
      'file-protected-external',
      'ep-protected-external',
      'SUB_ITA',
      'external',
      external,
    );

    const result = await service.deleteEntry({
      animeId: 'show-protected-folder',
      language: 'SUB_ITA',
      deleteFolder: true,
    });

    expect(result.deletedFiles).toBe(1);
    expect(result.failedFiles).toBe(0);
    expect(result.protectedExternalFiles).toBe(1);
    expect(existsSync(downloaded)).toBe(false);
    expect(existsSync(external)).toBe(true);
    expect(existsSync(dirname(external))).toBe(true);
    const externalRow = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-protected-external'))
      .get();
    expect(externalRow?.downloadStatus).toBe('external');
    expect(externalRow?.localPath).toBe(external);
  });

  it('deleteSeries con cestino sposta solo i download se la cartella contiene un external', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-protected-trash');
    insertEpisode(db, 'ep-protected-trash-downloaded', 'show-protected-trash', 1);
    insertEpisode(db, 'ep-protected-trash-external', 'show-protected-trash', 2);
    const { service, renamer, config } = makeService(db, tmpDir);
    config.set('trashEnabled', true);
    const downloaded = await placeEpisode(renamer, 'show-protected-trash', 1, 'SUB_ITA');
    const external = join(dirname(downloaded), 'user-external.mkv');
    await writeFile(external, 'external-bytes');
    insertFile(
      db,
      'file-protected-trash-downloaded',
      'ep-protected-trash-downloaded',
      'SUB_ITA',
      'downloaded',
      downloaded,
    );
    insertFile(
      db,
      'file-protected-trash-external',
      'ep-protected-trash-external',
      'SUB_ITA',
      'external',
      external,
    );

    const result = await service.deleteSeries({
      animeId: 'show-protected-trash',
      deleteFolder: true,
    });

    expect(result.deletedFiles).toBe(1);
    expect(result.failedFiles).toBe(0);
    expect(result.protectedExternalFiles).toBe(1);
    expect(existsSync(downloaded)).toBe(false);
    expect(existsSync(external)).toBe(true);
    expect((await readdir(join(tmpDir, '.trash'))).length).toBe(1);
    const externalRow = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-protected-trash-external'))
      .get();
    expect(externalRow?.downloadStatus).toBe('external');
    expect(externalRow?.localPath).toBe(external);
  });

  it('deleteEpisodeFile cancella il file, azzera la riga, pulisce coda e cartelle', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-d');
    insertEpisode(db, 'ep-d-1', 'show-d', 1);
    insertFile(db, 'file-d-1', 'ep-d-1', 'SUB_ITA');
    const { service, renamer, config } = makeService(db, tmpDir);
    // Cestino disattivo: verifichiamo l'hard-delete con pruning delle cartelle vuote.
    config.set('trashEnabled', false);
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

  it('deleteEpisodeFile con cestino attivo sposta il file in .trash (recuperabile) e azzera la riga', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-t');
    insertEpisode(db, 'ep-t-1', 'show-t', 1);
    insertFile(db, 'file-t-1', 'ep-t-1', 'SUB_ITA');
    const { service, renamer, config } = makeService(db, tmpDir);
    config.set('trashEnabled', true); // default, esplicito per chiarezza
    const file = await placeEpisode(renamer, 'show-t', 1, 'SUB_ITA');
    await service.scan();

    const res = await service.deleteEpisodeFile('file-t-1');
    expect(res).toEqual({ deletedFiles: 1, freedBytes: 10, failedFiles: 0 });
    // Il file non è più al percorso originale...
    expect(existsSync(file)).toBe(false);
    // ...ma è recuperabile nel cestino della root (una voce .trash/<id>/<nome>).
    const trashRoot = join(tmpDir, '.trash');
    expect(existsSync(trashRoot)).toBe(true);
    const entries = await readdir(trashRoot);
    expect(entries).toHaveLength(1);
    // La voce cestino contiene il file spostato + il .trashinfo.json dei metadati.
    const entryFiles = await readdir(join(trashRoot, entries[0] as string));
    expect(entryFiles.some((f) => f.endsWith('.mp4'))).toBe(true);
    expect(entryFiles).toContain('.trashinfo.json');

    const row = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-t-1'))
      .get();
    expect(row?.downloadStatus).toBe('not_downloaded');
    expect(row?.localPath).toBeNull();
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

  it('deleteEntry con deleteFolder + cestino attivo sposta la cartella serie in .trash come voce unica', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-tf');
    insertEpisode(db, 'ep-tf-1', 'show-tf', 1);
    insertEpisode(db, 'ep-tf-2', 'show-tf', 2);
    insertFile(db, 'file-tf-1', 'ep-tf-1', 'SUB_ITA');
    insertFile(db, 'file-tf-2', 'ep-tf-2', 'SUB_ITA');
    const { service, renamer, config } = makeService(db, tmpDir);
    config.set('trashEnabled', true);
    const f1 = await placeEpisode(renamer, 'show-tf', 1, 'SUB_ITA');
    await placeEpisode(renamer, 'show-tf', 2, 'SUB_ITA');
    await service.scan();
    // File extra non tracciato nella cartella serie (deve finire nel cestino con la cartella).
    const seriesDir = join(tmpDir, 'show-tf');
    const extra = join(seriesDir, 'Specials', 'OP1.mp4');
    await mkdir(dirname(extra), { recursive: true });
    await writeFile(extra, 'op-bytes');

    const res = await service.deleteEntry({
      animeId: 'show-tf',
      language: 'SUB_ITA',
      deleteFolder: true,
    });
    expect(res.failedFiles).toBe(0);
    expect(res.deletedFiles).toBeGreaterThanOrEqual(2);
    // Niente più al percorso originale (cartella intera spostata).
    expect(existsSync(f1)).toBe(false);
    expect(existsSync(extra)).toBe(false);
    expect(existsSync(seriesDir)).toBe(false);
    // Cestino: UNA sola voce (la cartella serie), non N file + cartella.
    const trashRoot = join(tmpDir, '.trash');
    const entries = await readdir(trashRoot);
    expect(entries).toHaveLength(1);
    const entryFiles = await readdir(join(trashRoot, entries[0] as string));
    expect(entryFiles).toContain('show-tf'); // la cartella serie spostata
    expect(entryFiles).toContain('.trashinfo.json');

    // DB azzerato per entrambi i tracciati.
    for (const id of ['file-tf-1', 'file-tf-2']) {
      const row = db.select().from(schema.episodeFile).where(eq(schema.episodeFile.id, id)).get();
      expect(row?.downloadStatus).toBe('not_downloaded');
      expect(row?.localPath).toBeNull();
    }
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

  it('deleteOrphans rifiuta una directory anche se contiene file active/external', async () => {
    const db = createTestDb();
    insertAnime(db, 'orphan-dir-show');
    insertEpisode(db, 'orphan-dir-episode', 'orphan-dir-show', 1);
    const directory = join(tmpDir, 'Dangerous directory');
    const external = join(directory, 'external.mkv');
    await mkdir(directory, { recursive: true });
    await writeFile(external, 'user-video');
    insertFile(db, 'orphan-dir-file', 'orphan-dir-episode', 'SUB_ITA', 'external', external);
    const { service, config } = makeService(db, tmpDir);
    config.set('trashEnabled', true);

    const res = await service.deleteOrphans([directory]);
    expect(res).toMatchObject({ deletedFiles: 0, failedFiles: 1 });
    expect(existsSync(directory)).toBe(true);
    expect(existsSync(external)).toBe(true);
    const row = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'orphan-dir-file'))
      .get();
    expect(row?.downloadStatus).toBe('external');
  });

  it('deleteOrphans rifiuta junction e symlink invece di spostarli nel cestino', async () => {
    const db = createTestDb();
    const { service, config } = makeService(db, tmpDir);
    config.set('trashEnabled', true);

    const physicalDirectory = join(tmpDir, 'Physical');
    const physicalFile = join(physicalDirectory, 'episode.mkv');
    const junction = join(tmpDir, 'Junction');
    await mkdir(physicalDirectory, { recursive: true });
    await writeFile(physicalFile, 'physical-video');
    await symlink(physicalDirectory, junction, 'junction');
    const aliases = [junction];

    const fileAlias = join(tmpDir, 'episode-alias.mkv');
    try {
      await symlink(physicalFile, fileAlias, 'file');
      aliases.push(fileAlias);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') {
        throw error;
      }
    }

    const res = await service.deleteOrphans(aliases);
    expect(res).toMatchObject({ deletedFiles: 0, failedFiles: aliases.length });
    expect(existsSync(junction)).toBe(true);
    expect(existsSync(physicalFile)).toBe(true);
    if (aliases.includes(fileAlias)) {
      expect(existsSync(fileAlias)).toBe(true);
    }
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

  it.each([false, true])(
    'deleteEntry con deleteFolder preserva il DUB attivo nella stessa cartella (trash=%s)',
    async (trashEnabled) => {
      const db = createTestDb();
      insertAnime(db, 'show-shared-folder');
      insertEpisode(db, 'ep-shared-folder', 'show-shared-folder', 1);
      insertFile(db, 'file-shared-sub', 'ep-shared-folder', 'SUB_ITA');
      insertFile(db, 'file-shared-dub', 'ep-shared-folder', 'DUB_ITA');
      const { service, renamer, config } = makeService(db, tmpDir);
      config.set('trashEnabled', trashEnabled);
      const sub = await placeEpisode(renamer, 'show-shared-folder', 1, 'SUB_ITA');
      const dub = await placeEpisode(renamer, 'show-shared-folder', 1, 'DUB_ITA');
      expect(dirname(sub)).toBe(dirname(dub));
      await service.scan();

      const result = await service.deleteEntry({
        animeId: 'show-shared-folder',
        language: 'SUB_ITA',
        deleteFolder: true,
      });

      expect(result).toMatchObject({
        deletedFiles: 1,
        failedFiles: 0,
        protectedNonTargetFiles: 1,
      });
      expect(existsSync(sub)).toBe(false);
      expect(existsSync(dub)).toBe(true);
      expect(existsSync(dirname(dub))).toBe(true);
      const dubRow = db
        .select()
        .from(schema.episodeFile)
        .where(eq(schema.episodeFile.id, 'file-shared-dub'))
        .get();
      expect(dubRow?.downloadStatus).toBe('downloaded');
      expect(dubRow?.localPath).toBe(dub);
    },
  );

  it('deleteSeries usa i membri risolti dalle relazioni e rimuove entrambe le stagioni', async () => {
    const db = createTestDb();
    insertAnime(db, 'chain-s1', { seriesId: null, seasonNumber: null });
    insertAnime(db, 'chain-s2', { seriesId: null, seasonNumber: null });
    db.insert(schema.animeRelation)
      .values({ animeId: 'chain-s2', relatedAnimeId: 'chain-s1', relationType: 'PREQUEL' })
      .run();
    db.insert(schema.animeRelation)
      .values({ animeId: 'chain-s1', relatedAnimeId: 'chain-s2', relationType: 'SEQUEL' })
      .run();
    insertEpisode(db, 'ep-chain-s1', 'chain-s1', 1);
    insertEpisode(db, 'ep-chain-s2', 'chain-s2', 1);
    insertFile(db, 'file-chain-s1', 'ep-chain-s1', 'SUB_ITA');
    insertFile(db, 'file-chain-s2', 'ep-chain-s2', 'SUB_ITA');
    const { service, renamer, config } = makeService(db, tmpDir);
    config.set('trashEnabled', false);
    const s1 = await placeEpisode(renamer, 'chain-s1', 1, 'SUB_ITA');
    const s2 = await placeEpisode(renamer, 'chain-s2', 1, 'SUB_ITA');
    await service.scan();

    const result = await service.deleteSeries({ animeId: 'chain-s2' });

    expect(result).toEqual({ deletedFiles: 2, freedBytes: 20, failedFiles: 0 });
    expect(existsSync(s1)).toBe(false);
    expect(existsSync(s2)).toBe(false);
  });

  it('serializza linkExternalFolder prima di deleteEntry e rivalida external sotto lock', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-concurrent');
    insertEpisode(db, 'ep-concurrent-sub', 'show-concurrent', 1);
    insertEpisode(db, 'ep-concurrent-external', 'show-concurrent', 2);
    const { service, files, renamer, config, coordinator } = makeService(db, tmpDir);
    config.set('trashEnabled', false);
    const downloaded = await placeEpisode(renamer, 'show-concurrent', 1, 'SUB_ITA');
    const external = join(dirname(downloaded), 'Show Concurrent - 02.mkv');
    await writeFile(external, 'external-bytes');
    insertFile(db, 'file-concurrent-sub', 'ep-concurrent-sub', 'SUB_ITA', 'downloaded', downloaded);
    insertFile(db, 'file-concurrent-dub', 'ep-concurrent-external', 'DUB_ITA');

    let enterLock = () => {};
    let releaseLock = () => {};
    const entered = new Promise<void>((resolve) => {
      enterLock = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const blocker = coordinator.runExclusive(async () => {
      enterLock();
      await released;
    });
    await entered;

    const linkPromise = files.linkExternalFolder(dirname(downloaded), 'show-concurrent', 'DUB_ITA');
    const deletePromise = service.deleteEntry({
      animeId: 'show-concurrent',
      language: 'SUB_ITA',
      deleteFolder: true,
    });
    releaseLock();

    const [linkResult, deleteResult] = await Promise.all([linkPromise, deletePromise]);
    await blocker;
    expect(linkResult.linked).toBe(1);
    expect(deleteResult).toMatchObject({
      deletedFiles: 1,
      failedFiles: 0,
      protectedExternalFiles: 1,
    });
    expect(existsSync(downloaded)).toBe(false);
    expect(existsSync(external)).toBe(true);
    const externalRow = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'file-concurrent-dub'))
      .get();
    expect(externalRow?.downloadStatus).toBe('external');
    expect(externalRow?.localPath).toBe(external);
  });

  it('con cestino attivo non fa hard-delete se il file è fuori dalle root configurate', async () => {
    const db = createTestDb();
    insertAnime(db, 'show-outside-root');
    insertEpisode(db, 'ep-outside-root', 'show-outside-root', 1);
    const outsideRoot = await mkdtemp(join(tmpdir(), 'au-library-outside-'));
    const outsideFile = join(outsideRoot, 'outside.mkv');
    try {
      await writeFile(outsideFile, 'outside-video');
      insertFile(db, 'file-outside-root', 'ep-outside-root', 'SUB_ITA', 'downloaded', outsideFile);
      const { service, config } = makeService(db, tmpDir);
      config.set('trashEnabled', true);

      const result = await service.deleteEpisodeFile('file-outside-root');

      expect(result).toEqual({ deletedFiles: 0, freedBytes: 0, failedFiles: 1 });
      expect(existsSync(outsideFile)).toBe(true);
      const row = db
        .select()
        .from(schema.episodeFile)
        .where(eq(schema.episodeFile.id, 'file-outside-root'))
        .get();
      expect(row?.downloadStatus).toBe('downloaded');
      expect(row?.localPath).toBe(outsideFile);
    } finally {
      await rm(outsideRoot, { recursive: true, force: true });
    }
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

describe('LibraryService hardening path fisici', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'au-library-physical-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it.each(['external', 'downloaded'] as const)(
    'preserva il target condiviso tramite junction con una riga %s fuori scope',
    async (referenceStatus) => {
      const db = createTestDb();
      insertAnime(db, 'target-anime');
      insertAnime(db, 'reference-anime');
      insertEpisode(db, 'target-episode', 'target-anime', 1);
      insertEpisode(db, 'reference-episode', 'reference-anime', 1);

      const physicalDir = join(root, 'Physical', 'Season 01');
      const targetPath = join(physicalDir, 'episode.mkv');
      const aliasDir = join(root, 'Alias');
      await mkdir(physicalDir, { recursive: true });
      await writeFile(targetPath, 'shared-video');
      await symlink(physicalDir, aliasDir, 'junction');
      const aliasPath = join(aliasDir, 'episode.mkv');

      insertFile(db, 'target-file', 'target-episode', 'SUB_ITA', 'downloaded', targetPath);
      insertFile(db, 'reference-file', 'reference-episode', 'SUB_ITA', referenceStatus, aliasPath);
      const { service, config } = makeService(db, root);
      config.set('trashEnabled', false);

      const result = await service.deleteEpisodeFile('target-file');

      expect(result).toMatchObject({ deletedFiles: 0, failedFiles: 0 });
      if (referenceStatus === 'external') {
        expect(result.protectedExternalFiles).toBe(1);
      } else {
        expect(result.protectedNonTargetFiles).toBe(1);
      }
      expect(existsSync(targetPath)).toBe(true);
      const targetRow = db
        .select()
        .from(schema.episodeFile)
        .where(eq(schema.episodeFile.id, 'target-file'))
        .get();
      expect(targetRow?.downloadStatus).toBe('downloaded');
      expect(targetRow?.localPath).toBe(targetPath);
    },
  );

  it('rifiuta un target logico sotto root che tramite junction punta fuori root', async () => {
    const db = createTestDb();
    const outside = await mkdtemp(join(tmpdir(), 'au-library-outside-link-'));
    try {
      insertAnime(db, 'escape-anime');
      insertEpisode(db, 'escape-episode', 'escape-anime', 1);
      const outsideFile = join(outside, 'outside.mkv');
      await writeFile(outsideFile, 'outside-video');
      const escapeDir = join(root, 'Escape');
      await symlink(outside, escapeDir, 'junction');
      const linkedPath = join(escapeDir, 'outside.mkv');
      insertFile(db, 'escape-file', 'escape-episode', 'SUB_ITA', 'downloaded', linkedPath);
      const { service, config } = makeService(db, root);
      config.set('trashEnabled', true);

      const result = await service.deleteEpisodeFile('escape-file');

      expect(result).toEqual({ deletedFiles: 0, freedBytes: 0, failedFiles: 1 });
      expect(existsSync(linkedPath)).toBe(true);
      expect(existsSync(outsideFile)).toBe(true);
      const row = db
        .select()
        .from(schema.episodeFile)
        .where(eq(schema.episodeFile.id, 'escape-file'))
        .get();
      expect(row?.downloadStatus).toBe('downloaded');
      expect(row?.localPath).toBe(linkedPath);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('deleteFolder con cestino rifiuta fail-closed una cartella symlink/junction', async () => {
    const db = createTestDb();
    insertAnime(db, 'linked-anime');
    insertEpisode(db, 'linked-episode', 'linked-anime', 1);
    const physicalFolder = join(root, 'Physical Series');
    const physicalSeason = join(physicalFolder, 'Season 01');
    const physicalFile = join(physicalSeason, 'episode.mkv');
    const logicalFolder = join(root, 'Logical Series');
    await mkdir(physicalSeason, { recursive: true });
    await writeFile(physicalFile, 'physical-video');
    await symlink(
      process.platform === 'win32' ? physicalFolder : 'Physical Series',
      logicalFolder,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const logicalFile = join(logicalFolder, 'Season 01', 'episode.mkv');
    insertFile(db, 'linked-file', 'linked-episode', 'SUB_ITA', 'downloaded', logicalFile);
    const { service, config } = makeService(db, root);
    config.set('trashEnabled', true);

    const result = await service.deleteEntry({
      animeId: 'linked-anime',
      language: 'SUB_ITA',
      deleteFolder: true,
    });

    expect(result).toEqual({
      deletedFiles: 0,
      freedBytes: 0,
      failedFiles: 0,
      failedFolders: 1,
    });
    expect(existsSync(logicalFolder)).toBe(true);
    expect(existsSync(physicalFolder)).toBe(true);
    expect(existsSync(physicalFile)).toBe(true);
    expect(existsSync(join(root, '.trash'))).toBe(false);
    const row = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'linked-file'))
      .get();
    expect(row?.downloadStatus).toBe('downloaded');
    expect(row?.localPath).toBe(logicalFile);
  });

  it('un errore sul move della cartella incrementa failedFolders e lascia file e DB intatti', async () => {
    const db = createTestDb();
    insertAnime(db, 'folder-failure');
    insertEpisode(db, 'folder-failure-episode', 'folder-failure', 1);
    const failingMove: typeof moveToTrash = async () => {
      throw new Error('move cartella fallito');
    };
    const { service, renamer, config } = makeService(db, root, failingMove);
    config.set('trashEnabled', true);
    const file = await placeEpisode(renamer, 'folder-failure', 1, 'SUB_ITA');
    insertFile(db, 'folder-failure-file', 'folder-failure-episode', 'SUB_ITA', 'downloaded', file);

    const result = await service.deleteEntry({
      animeId: 'folder-failure',
      language: 'SUB_ITA',
      deleteFolder: true,
    });

    expect(result).toEqual({
      deletedFiles: 0,
      freedBytes: 0,
      failedFiles: 0,
      failedFolders: 1,
    });
    expect(existsSync(file)).toBe(true);
    const row = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'folder-failure-file'))
      .get();
    expect(row?.downloadStatus).toBe('downloaded');
    expect(row?.localPath).toBe(file);
  });
});
