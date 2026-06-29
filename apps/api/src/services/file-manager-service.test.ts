import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../db';
import { createTestDb, testLogger } from '../test/helpers';
import { createConfigService } from './config-service';
import { createFileManagerService, parseEpisodeNumber } from './file-manager-service';
import { createRenamerService } from './renamer-service';

/** Seed di un anime con N episodi + episode_file in una lingua (per i test linkExternalFolder). */
function seedSeries(
  db: ReturnType<typeof createTestDb>,
  numbers: number[],
  language: 'SUB_ITA' | 'DUB_ITA' = 'SUB_ITA',
  status: 'not_downloaded' | 'downloaded' | 'external' = 'not_downloaded',
) {
  const ts = new Date().toISOString();
  db.insert(schema.anime)
    .values({
      id: 'a-1',
      slug: 'show',
      title: 'Show',
      type: 'TV',
      status: 'ONGOING',
      episodeCount: numbers.length,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  for (const n of numbers) {
    db.insert(schema.episode)
      .values({ id: `e-${n}`, animeId: 'a-1', number: n, createdAt: ts, updatedAt: ts })
      .run();
    db.insert(schema.episodeFile)
      .values({
        id: `ef-${n}`,
        episodeId: `e-${n}`,
        language,
        downloadStatus: status,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  }
}

function seedEpisode(
  db: ReturnType<typeof createTestDb>,
  opts: { localPath?: string; status?: 'not_downloaded' | 'downloaded' } = {},
) {
  const ts = new Date().toISOString();
  db.insert(schema.anime)
    .values({
      id: 'a-1',
      slug: 'show',
      title: 'Show',
      type: 'TV',
      status: 'ONGOING',
      episodeCount: 12,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  db.insert(schema.episode)
    .values({ id: 'e-1', animeId: 'a-1', number: 1, createdAt: ts, updatedAt: ts })
    .run();
  db.insert(schema.episodeFile)
    .values({
      id: 'ef-1',
      episodeId: 'e-1',
      language: 'SUB_ITA',
      downloadStatus: opts.status ?? 'not_downloaded',
      localPath: opts.localPath ?? null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
}

describe('FileManagerService', () => {
  let db: ReturnType<typeof createTestDb>;
  let root: string;
  let service: ReturnType<typeof createFileManagerService>;

  beforeEach(async () => {
    db = createTestDb();
    root = await mkdtemp(join(tmpdir(), 'au-fm-'));
    const config = createConfigService({ db });
    config.set('seriesPathSub', root);
    const renamer = createRenamerService({ db, config });
    service = createFileManagerService({ db, config, renamer, logger: testLogger });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('list mostra le radici e il contenuto di una cartella', async () => {
    await mkdir(join(root, 'Show', 'Season 01'), { recursive: true });
    await writeFile(join(root, 'Show', 'Season 01', 'Show - S01E01.mp4'), 'x');

    const rootsList = await service.list();
    expect(rootsList.atRoot).toBe(false);
    expect(rootsList.entries.map((e) => e.path)).toContain(resolve(root));

    const inside = await service.list(join(root, 'Show', 'Season 01'));
    expect(inside.entries.find((e) => e.name === 'Show - S01E01.mp4')?.type).toBe('file');
  });

  it('marca extra le sottocartelle (backdrops/themes) a qualunque profondita e content le stagioni', async () => {
    await mkdir(join(root, 'Show', 'Season 01', 'backdrops'), { recursive: true });
    await mkdir(join(root, 'Show', 'Season 02'), { recursive: true });
    await mkdir(join(root, 'Show', 'Specials', 'themes'), { recursive: true });
    await mkdir(join(root, 'Show', 'backdrops'), { recursive: true });
    await writeFile(join(root, 'Show', 'Season 01', 'Show - S01E01.mp4'), 'x');

    const series = await service.list(join(root, 'Show'));
    const byName = (n: string) => series.entries.find((e) => e.name === n);
    // Le stagioni/Specials sono content (contate come stagioni dal frontend), non extra.
    expect(byName('Season 01')).toMatchObject({ content: true, extra: false });
    expect(byName('Season 02')).toMatchObject({ content: true, extra: false });
    expect(byName('Specials')).toMatchObject({ content: true, extra: false });
    // I contenitori artwork a livello serie sono extra e non content.
    expect(byName('backdrops')).toMatchObject({ content: false, extra: true });
    // Solo 3 cartelle di contenuto: Season 01, Season 02, Specials (backdrops escluso).
    expect(series.entries.filter((e) => e.type === 'dir' && e.content)).toHaveLength(3);

    // Dentro una stagione: backdrops resta extra (profondita' >1), il file no.
    const inside = await service.list(join(root, 'Show', 'Season 01'));
    expect(inside.entries.find((e) => e.name === 'backdrops')).toMatchObject({
      content: false,
      extra: true,
    });
    expect(inside.entries.find((e) => e.name === 'Show - S01E01.mp4')?.extra).toBe(false);

    // Dentro Specials: themes e' extra (nome noto, profondita' >1).
    const specials = await service.list(join(root, 'Show', 'Specials'));
    expect(specials.entries.find((e) => e.name === 'themes')?.extra).toBe(true);
  });

  it('mkdir, rename e move funzionano dentro le radici', async () => {
    await service.mkdir(root, 'New');
    expect((await stat(join(root, 'New'))).isDirectory()).toBe(true);

    await writeFile(join(root, 'a.mp4'), 'x');
    const renamed = await service.rename(join(root, 'a.mp4'), 'b.mp4');
    expect(renamed.path).toBe(resolve(join(root, 'b.mp4')));

    await service.move(join(root, 'b.mp4'), join(root, 'New'));
    expect((await stat(join(root, 'New', 'b.mp4'))).isFile()).toBe(true);
  });

  it('rename e move rifiutano la sovrascrittura di un elemento esistente (anti-perdita-dati)', async () => {
    await writeFile(join(root, 'uno.mp4'), 'AAA');
    await writeFile(join(root, 'due.mp4'), 'BBB');

    // Rinominare "uno.mp4" in "due.mp4" (gia' esistente) e' bloccato: niente clobber.
    await expect(service.rename(join(root, 'uno.mp4'), 'due.mp4')).rejects.toThrow(/esiste/i);
    expect((await stat(join(root, 'uno.mp4'))).size).toBe(3); // 'AAA' intatto
    expect((await stat(join(root, 'due.mp4'))).size).toBe(3); // 'BBB' intatto

    // Spostare "uno.mp4" in una cartella che contiene gia' un "uno.mp4" e' bloccato.
    await mkdir(join(root, 'Dest'), { recursive: true });
    await writeFile(join(root, 'Dest', 'uno.mp4'), 'CCCCC');
    await expect(service.move(join(root, 'uno.mp4'), join(root, 'Dest'))).rejects.toThrow(
      /destinazione/i,
    );
    expect((await stat(join(root, 'uno.mp4'))).size).toBe(3); // origine intatta
    expect((await stat(join(root, 'Dest', 'uno.mp4'))).size).toBe(5); // 'CCCCC' intatto
  });

  it('remove elimina i file e rifiuta operazioni fuori dalle radici', async () => {
    await writeFile(join(root, 'c.mp4'), 'x');
    await service.remove(join(root, 'c.mp4'));
    await expect(stat(join(root, 'c.mp4'))).rejects.toBeTruthy();

    await expect(service.remove(join(tmpdir(), 'fuori.mp4'))).rejects.toThrow();
    await expect(service.rename(root, 'X')).rejects.toThrow();
  });

  it('cestino: remove sposta in .trash, trashList elenca, trashRestore ripristina', async () => {
    // trashEnabled è true di default.
    await writeFile(join(root, 'film.mp4'), 'video');
    await service.remove(join(root, 'film.mp4'));
    // Sparito dalla posizione originale ma recuperabile.
    await expect(stat(join(root, 'film.mp4'))).rejects.toBeTruthy();

    const trash = await service.trashList();
    expect(trash.entries).toHaveLength(1);
    const entry = trash.entries[0];
    if (!entry) {
      throw new Error('voce cestino mancante');
    }
    expect(entry.name).toBe('film.mp4');
    expect(entry.originalPath).toBe(resolve(join(root, 'film.mp4')));

    await service.trashRestore(entry.id);
    expect((await stat(join(root, 'film.mp4'))).isFile()).toBe(true);
    expect((await service.trashList()).entries).toHaveLength(0);
  });

  it('cestino: trashEmpty e pruneTrash eliminano definitivamente', async () => {
    await writeFile(join(root, 'a.mp4'), 'x');
    await service.remove(join(root, 'a.mp4'));
    expect((await service.trashList()).entries).toHaveLength(1);

    // pruneTrash con retention futura non tocca nulla (voce appena creata).
    expect(await service.pruneTrash(30)).toBe(0);
    // retention 0 giorni: tutto scaduto.
    expect(await service.pruneTrash(0)).toBe(1);
    expect((await service.trashList()).entries).toHaveLength(0);

    await writeFile(join(root, 'b.mp4'), 'x');
    await service.remove(join(root, 'b.mp4'));
    const emptied = await service.trashEmpty();
    expect(emptied.count).toBe(1);
    expect((await service.trashList()).entries).toHaveLength(0);
  });

  it('cestino disattivato: remove cancella definitivamente', async () => {
    const config = createConfigService({ db });
    config.set('trashEnabled', false);
    const svc = createFileManagerService({
      db,
      config,
      renamer: createRenamerService({ db, config }),
      logger: testLogger,
    });
    await writeFile(join(root, 'c.mp4'), 'x');
    await svc.remove(join(root, 'c.mp4'));
    await expect(stat(join(root, 'c.mp4'))).rejects.toBeTruthy();
    expect((await svc.trashList()).entries).toHaveLength(0);
  });

  it('remove rifiuta cartelle e file collegati come esterni (anti-perdita-dati)', async () => {
    const season = join(root, 'Show', 'Season 01');
    await mkdir(season, { recursive: true });
    const ext = join(season, 'Show - 01.mkv');
    await writeFile(ext, 'a');
    seedSeries(db, [1], 'SUB_ITA', 'external');
    // localPath che punta al file dell'utente (come dopo linkExternalFolder).
    db.update(schema.episodeFile)
      .set({ localPath: resolve(ext) })
      .where(eq(schema.episodeFile.id, 'ef-1'))
      .run();

    // Eliminare la cartella che contiene l'esterno è bloccato e i file restano su disco.
    await expect(service.remove(join(root, 'Show'))).rejects.toThrow(/esterni/i);
    await expect(service.remove(season)).rejects.toThrow(/esterni/i);
    await expect(service.remove(ext)).rejects.toThrow(/esterni/i);
    expect((await stat(ext)).isFile()).toBe(true);
  });

  it('sincronizza episode_file su rename e azzera su remove', async () => {
    await mkdir(join(root, 'Show', 'Season 01'), { recursive: true });
    const file = join(root, 'Show', 'Season 01', 'Show - S01E01.mp4');
    await writeFile(file, 'x');
    seedEpisode(db, { localPath: file, status: 'downloaded' });

    const renamed = await service.rename(file, 'renamed.mp4');
    const afterRename = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'ef-1'))
      .get();
    expect(afterRename?.localPath).toBe(renamed.path);

    await service.remove(renamed.path ?? '');
    const afterRemove = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'ef-1'))
      .get();
    expect(afterRemove?.downloadStatus).toBe('not_downloaded');
    expect(afterRemove?.localPath).toBeNull();
  });

  it('relink sposta un orfano al percorso atteso e marca downloaded', async () => {
    const orphan = join(root, 'random-name.mp4');
    await writeFile(orphan, 'video-bytes');
    seedEpisode(db, { status: 'not_downloaded' });

    const res = await service.relink(orphan, 'ef-1');
    // Percorso atteso dal renamer: <root>/Show/Season 01/Show - S01E01 - SUB ITA.mp4 (unica root → suffisso).
    expect(res.path).toBe(resolve(join(root, 'Show', 'Season 01', 'Show - S01E01 - SUB ITA.mp4')));
    expect((await stat(res.path ?? '')).isFile()).toBe(true);

    const row = db.select().from(schema.episodeFile).where(eq(schema.episodeFile.id, 'ef-1')).get();
    expect(row?.downloadStatus).toBe('downloaded');
    expect(row?.localPath).toBe(res.path);
  });

  it('classifica i file: Specials/OVA = contenuto, backdrops = extra, Season = contenuto', async () => {
    await mkdir(join(root, 'Show', 'Specials'), { recursive: true });
    await mkdir(join(root, 'Show', 'backdrops'), { recursive: true });
    await mkdir(join(root, 'Show', 'Season 01'), { recursive: true });
    await writeFile(join(root, 'Show', 'Specials', 'OVA.mp4'), 'x');
    await writeFile(join(root, 'Show', 'backdrops', 'opening.mp4'), 'x');
    await writeFile(join(root, 'Show', 'Season 01', 'Show - S01E01.mp4'), 'x');

    // Special = contenuto: il file non e' extra (sara' un orfano collegabile).
    const specials = await service.list(join(root, 'Show', 'Specials'));
    const ova = specials.entries.find((e) => e.name === 'OVA.mp4');
    expect(ova?.extra).toBe(false);
    expect(ova?.episodeFileId).toBeNull();

    // backdrops = cartella cosmetica: i file sono extra.
    const backdrops = await service.list(join(root, 'Show', 'backdrops'));
    expect(backdrops.entries.find((e) => e.name === 'opening.mp4')?.extra).toBe(true);

    // Una cartella di stagione normale non e' extra.
    const s1 = await service.list(join(root, 'Show', 'Season 01'));
    expect(s1.entries.find((e) => e.name === 'Show - S01E01.mp4')?.extra).toBe(false);
  });

  it('classifica le cartelle: Season/Specials = contenuto, backdrops/altro = extra', async () => {
    await mkdir(join(root, 'Show', 'Season 01'), { recursive: true });
    await mkdir(join(root, 'Show', 'Specials'), { recursive: true });
    await mkdir(join(root, 'Show', 'backdrops'), { recursive: true });
    await mkdir(join(root, 'Show', 'PV'), { recursive: true });

    const dirs = await service.list(join(root, 'Show'));
    const byName = (n: string) => dirs.entries.find((e) => e.name === n);
    expect(byName('Season 01')?.extra).toBe(false);
    expect(byName('Specials')?.extra).toBe(false);
    expect(byName('backdrops')?.extra).toBe(true);
    expect(byName('PV')?.extra).toBe(true);

    // La cartella-serie di livello 1 non e' mai extra.
    const root1 = await service.list(root);
    expect(root1.entries.find((e) => e.name === 'Show')?.extra).toBe(false);
  });

  it('marca le cartelle importate (managed) e mette le non importate in cima', async () => {
    // Cartella "Show": importata (contiene un episode_file tracciato).
    await mkdir(join(root, 'Show', 'Season 01'), { recursive: true });
    const tracked = join(root, 'Show', 'Season 01', 'Show - S01E01.mp4');
    await writeFile(tracked, 'x');
    seedEpisode(db, { localPath: tracked, status: 'downloaded' });
    // Cartella "Altro": non importata (solo file non collegati).
    await mkdir(join(root, 'Altro'), { recursive: true });
    await writeFile(join(root, 'Altro', 'video.mp4'), 'x');

    const list = await service.list(root);
    expect(list.entries.find((e) => e.name === 'Show')?.managed).toBe(true);
    expect(list.entries.find((e) => e.name === 'Altro')?.managed).toBe(false);
    // Ordinamento: la cartella non importata viene prima di quella importata.
    const dirs = list.entries.filter((e) => e.type === 'dir').map((e) => e.name);
    expect(dirs.indexOf('Altro')).toBeLessThan(dirs.indexOf('Show'));
  });

  it('list con più serie: scoping per sotto-albero, nomi-prefisso non confusi', async () => {
    const ts = new Date().toISOString();
    // Serie A "Show": NESSUN file tracciato (solo un orfano su disco).
    await mkdir(join(root, 'Show', 'Season 01'), { recursive: true });
    await writeFile(join(root, 'Show', 'Season 01', 'orphan.mp4'), 'x');
    // Serie B "Show 2": un file tracciato. Il suo nome ha "Show" come prefisso.
    const trackedB = join(root, 'Show 2', 'Season 01', 'Show 2 - S01E01.mp4');
    await mkdir(dirname(trackedB), { recursive: true });
    await writeFile(trackedB, 'x');
    db.insert(schema.anime)
      .values({
        id: 'a-2',
        slug: 'show-2',
        title: 'Show 2',
        type: 'TV',
        status: 'ONGOING',
        episodeCount: 1,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    db.insert(schema.episode)
      .values({ id: 'e-b1', animeId: 'a-2', number: 1, createdAt: ts, updatedAt: ts })
      .run();
    db.insert(schema.episodeFile)
      .values({
        id: 'ef-b1',
        episodeId: 'e-b1',
        language: 'SUB_ITA',
        downloadStatus: 'downloaded',
        localPath: resolve(trackedB),
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    const list = await service.list(root);
    // Il file tracciato di "Show 2" NON deve marcare "Show" come importata (confine sul separatore).
    expect(list.entries.find((e) => e.name === 'Show')?.managed).toBe(false);
    expect(list.entries.find((e) => e.name === 'Show 2')?.managed).toBe(true);

    // Dentro "Show 2/Season 01" il file è riconosciuto come tracciato (scoping include il sotto-albero).
    const insideB = await service.list(dirname(trackedB));
    expect(insideB.entries.find((e) => e.name === 'Show 2 - S01E01.mp4')?.episodeFileId).toBe(
      'ef-b1',
    );

    // Dentro "Show/Season 01" il file resta orfano (lo scoping non trascina i tracciati di altre serie).
    const insideA = await service.list(join(root, 'Show', 'Season 01'));
    expect(insideA.entries.find((e) => e.name === 'orphan.mp4')?.episodeFileId).toBeNull();
  });

  it('rename di una serie non tocca i link di una serie con nome-prefisso', async () => {
    const ts = new Date().toISOString();
    // "Show": tracciato (a-1, ef-1).
    const fileA = join(root, 'Show', 'Season 01', 'Show - S01E01.mp4');
    await mkdir(dirname(fileA), { recursive: true });
    await writeFile(fileA, 'x');
    seedEpisode(db, { localPath: fileA, status: 'downloaded' });
    // "Show 2": tracciato (nome con "Show" come prefisso).
    const fileB = join(root, 'Show 2', 'Season 01', 'Show 2 - S01E01.mp4');
    await mkdir(dirname(fileB), { recursive: true });
    await writeFile(fileB, 'x');
    db.insert(schema.anime)
      .values({
        id: 'a-2',
        slug: 'show-2',
        title: 'Show 2',
        type: 'TV',
        status: 'ONGOING',
        episodeCount: 1,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    db.insert(schema.episode)
      .values({ id: 'e-b1', animeId: 'a-2', number: 1, createdAt: ts, updatedAt: ts })
      .run();
    db.insert(schema.episodeFile)
      .values({
        id: 'ef-b1',
        episodeId: 'e-b1',
        language: 'SUB_ITA',
        downloadStatus: 'downloaded',
        localPath: resolve(fileB),
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    await service.rename(join(root, 'Show'), 'Show Renamed');
    // Il link di "Show 2" resta intatto (lo scoping del sync non scavalca il confine).
    const efB = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, 'ef-b1'))
      .get();
    expect(efB?.localPath).toBe(resolve(fileB));
    // Il link di "Show" è stato aggiornato al nuovo nome.
    const efA = db.select().from(schema.episodeFile).where(eq(schema.episodeFile.id, 'ef-1')).get();
    expect(efA?.localPath).toBe(
      resolve(join(root, 'Show Renamed', 'Season 01', 'Show - S01E01.mp4')),
    );
  });

  it('renameToScheme sposta i file tracciati nel percorso atteso dal renamer', async () => {
    const wrong = join(root, 'random', 'whatever.mp4');
    await mkdir(dirname(wrong), { recursive: true });
    await writeFile(wrong, 'x');
    seedEpisode(db, { localPath: wrong, status: 'downloaded' });

    const res = await service.renameToScheme(root);
    expect(res.count).toBe(1);
    const expected = resolve(join(root, 'Show', 'Season 01', 'Show - S01E01 - SUB ITA.mp4'));
    expect((await stat(expected)).isFile()).toBe(true);
    const row = db.select().from(schema.episodeFile).where(eq(schema.episodeFile.id, 'ef-1')).get();
    expect(row?.localPath).toBe(expected);
  });

  it('linkExternalFolder collega i file esterni senza spostarli e li marca external', async () => {
    const season = join(root, 'Show', 'Season 01');
    await mkdir(season, { recursive: true });
    const f1 = join(season, 'Show - 01.mkv');
    const f2 = join(season, 'Show - 02.mkv');
    const f99 = join(season, 'Show - 99.mkv'); // nessun episodio corrispondente
    await writeFile(f1, 'a');
    await writeFile(f2, 'bb');
    await writeFile(f99, 'c');
    await writeFile(join(season, 'note.txt'), 'x'); // non video: ignorato del tutto
    seedSeries(db, [1, 2, 3]);

    const res = await service.linkExternalFolder(season, 'a-1', 'SUB_ITA');
    expect(res.linked).toBe(2);
    expect(res.unmatched).toBe(1); // il 99 non ha episodio
    expect(res.skipped).toBe(0);

    // I file NON sono stati spostati.
    expect((await stat(f1)).isFile()).toBe(true);
    expect((await stat(f2)).isFile()).toBe(true);

    const ef1 = db.select().from(schema.episodeFile).where(eq(schema.episodeFile.id, 'ef-1')).get();
    expect(ef1?.downloadStatus).toBe('external');
    expect(ef1?.localPath).toBe(resolve(f1));
    expect(ef1?.fileSize).toBe(1);

    // L'episodio senza file resta non scaricato.
    const ef3 = db.select().from(schema.episodeFile).where(eq(schema.episodeFile.id, 'ef-3')).get();
    expect(ef3?.downloadStatus).toBe('not_downloaded');
    expect(ef3?.localPath).toBeNull();
  });

  it('linkExternalFolder salta gli episodi gia scaricati dall app', async () => {
    const season = join(root, 'Show', 'Season 01');
    await mkdir(season, { recursive: true });
    await writeFile(join(season, 'Show - 01.mkv'), 'a');
    seedSeries(db, [1], 'SUB_ITA', 'downloaded');

    const res = await service.linkExternalFolder(season, 'a-1', 'SUB_ITA');
    expect(res.linked).toBe(0);
    expect(res.skipped).toBe(1);
    const ef1 = db.select().from(schema.episodeFile).where(eq(schema.episodeFile.id, 'ef-1')).get();
    expect(ef1?.downloadStatus).toBe('downloaded'); // invariato
  });

  it('pruneEmpty rimuove le sottocartelle vuote ma non quelle con file', async () => {
    await mkdir(join(root, 'Empty', 'Nested'), { recursive: true });
    await mkdir(join(root, 'WithFile'), { recursive: true });
    await writeFile(join(root, 'WithFile', 'keep.mp4'), 'x');

    const res = await service.pruneEmpty(root);
    expect(res.count).toBe(2); // Empty/Nested + Empty
    await expect(stat(join(root, 'Empty'))).rejects.toBeTruthy();
    expect((await stat(join(root, 'WithFile'))).isDirectory()).toBe(true);
  });
});

describe('parseEpisodeNumber', () => {
  it.each([
    ['Show - S01E12.mkv', 12],
    ['show_s1e5_1080p.mkv', 5],
    ['One Piece - 01.mkv', 1],
    ['Naruto Ep 07.mp4', 7],
    ['Episodio 23.mp4', 23],
    ['Show - 08v2.mkv', 8],
    ['12.mkv', 12],
    ['Show 2024 05.mkv', 5],
    ['Show 1080p.mkv', null],
    ['random-name.mkv', null],
  ])('%s -> %s', (name, expected) => {
    expect(parseEpisodeNumber(name)).toBe(expected);
  });
});
