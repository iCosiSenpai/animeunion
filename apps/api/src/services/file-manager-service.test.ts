import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../db';
import { createTestDb, testLogger } from '../test/helpers';
import { createConfigService } from './config-service';
import { createFileManagerService } from './file-manager-service';
import { createRenamerService } from './renamer-service';

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

  it('mkdir, rename e move funzionano dentro le radici', async () => {
    await service.mkdir(root, 'New');
    expect((await stat(join(root, 'New'))).isDirectory()).toBe(true);

    await writeFile(join(root, 'a.mp4'), 'x');
    const renamed = await service.rename(join(root, 'a.mp4'), 'b.mp4');
    expect(renamed.path).toBe(resolve(join(root, 'b.mp4')));

    await service.move(join(root, 'b.mp4'), join(root, 'New'));
    expect((await stat(join(root, 'New', 'b.mp4'))).isFile()).toBe(true);
  });

  it('remove elimina i file e rifiuta operazioni fuori dalle radici', async () => {
    await writeFile(join(root, 'c.mp4'), 'x');
    await service.remove(join(root, 'c.mp4'));
    await expect(stat(join(root, 'c.mp4'))).rejects.toBeTruthy();

    await expect(service.remove(join(tmpdir(), 'fuori.mp4'))).rejects.toThrow();
    await expect(service.rename(root, 'X')).rejects.toThrow();
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

  it('non segnala come orfani i file nelle cartelle extra (Specials/backdrops)', async () => {
    await mkdir(join(root, 'Show', 'Specials'), { recursive: true });
    await mkdir(join(root, 'Show', 'backdrops'), { recursive: true });
    await mkdir(join(root, 'Show', 'Season 01'), { recursive: true });
    await writeFile(join(root, 'Show', 'Specials', 'OVA.mp4'), 'x');
    await writeFile(join(root, 'Show', 'backdrops', 'opening.mp4'), 'x');
    await writeFile(join(root, 'Show', 'Season 01', 'Show - S01E01.mp4'), 'x');

    const specials = await service.list(join(root, 'Show', 'Specials'));
    const ova = specials.entries.find((e) => e.name === 'OVA.mp4');
    expect(ova?.extra).toBe(true);
    expect(ova?.episodeFileId).toBeNull();

    const backdrops = await service.list(join(root, 'Show', 'backdrops'));
    expect(backdrops.entries.find((e) => e.name === 'opening.mp4')?.extra).toBe(true);

    // Una cartella di stagione normale non e' extra.
    const s1 = await service.list(join(root, 'Show', 'Season 01'));
    expect(s1.entries.find((e) => e.name === 'Show - S01E01.mp4')?.extra).toBe(false);
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
