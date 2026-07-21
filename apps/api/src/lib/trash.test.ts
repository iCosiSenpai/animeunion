import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TRASH_DIR, moveToTrash } from './trash';

describe('moveToTrash', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'au-trash-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lascia intatto il target e ripulisce la voce se fallisce la scrittura metadata', async () => {
    const target = join(root, 'episode.mkv');
    await writeFile(target, 'video');

    await expect(
      moveToTrash(target, root, false, undefined, {
        writeInfo: async () => {
          throw new Error('metadata non scrivibile');
        },
      }),
    ).rejects.toThrow('metadata non scrivibile');

    expect(existsSync(target)).toBe(true);
    expect(await readdir(join(root, TRASH_DIR))).toEqual([]);
  });

  it('compensa un move che segnala errore dopo lo spostamento', async () => {
    const target = join(root, 'episode.mkv');
    await writeFile(target, 'video');
    let moves = 0;

    await expect(
      moveToTrash(target, root, false, undefined, {
        atomicMove: async (from, to) => {
          await rename(from, to);
          moves += 1;
          if (moves === 1) {
            throw new Error('errore dopo il move');
          }
        },
      }),
    ).rejects.toThrow('errore dopo il move');

    expect(moves).toBe(2);
    expect(existsSync(target)).toBe(true);
    expect(await readdir(join(root, TRASH_DIR))).toEqual([]);
  });

  it('rifiuta una cartella symlink/junction prima di creare la voce cestino', async () => {
    const physical = join(root, 'Physical');
    const logical = join(root, 'Logical');
    await mkdir(physical, { recursive: true });
    await writeFile(join(physical, 'episode.mkv'), 'video');
    await symlink(
      process.platform === 'win32' ? physical : 'Physical',
      logical,
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(moveToTrash(logical, root, true)).rejects.toThrow(/symlink|junction/i);

    expect(existsSync(logical)).toBe(true);
    expect(existsSync(physical)).toBe(true);
    expect(existsSync(join(physical, 'episode.mkv'))).toBe(true);
    expect(existsSync(join(root, TRASH_DIR))).toBe(false);
  });
});
