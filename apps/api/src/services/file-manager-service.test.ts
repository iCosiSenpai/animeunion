import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
});
