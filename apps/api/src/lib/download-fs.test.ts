import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testLogger } from '../test/helpers';
import {
  atomicMove,
  ensureDir,
  pad2,
  sanitizeSlugForFs,
  targetPath,
  tempPath,
} from './download-fs';

describe('sanitizeSlugForFs', () => {
  it('lowercase, no spazi, no caratteri non sicuri', () => {
    expect(sanitizeSlugForFs('Re:Zero 2nd Season!')).toBe('rezero-2nd-season');
  });

  it('rimuove accenti (NFKD)', () => {
    expect(sanitizeSlugForFs('Città Oscura')).toBe('citta-oscura');
  });

  it('tronca slug lunghissimi a 200 caratteri', () => {
    const long = 'a'.repeat(500);
    expect(sanitizeSlugForFs(long)).toHaveLength(200);
  });

  it('cade sempre su "anime" se slug vuoto dopo sanitizzazione', () => {
    expect(sanitizeSlugForFs('!!!')).toBe('anime');
    expect(sanitizeSlugForFs('')).toBe('anime');
  });
});

describe('pad2', () => {
  it('padding a 2 cifre', () => {
    expect(pad2(1)).toBe('01');
    expect(pad2(10)).toBe('10');
    expect(pad2(99)).toBe('99');
  });
});

describe('targetPath', () => {
  it('costruisce <animePath>/<slug>/Season NN/SXXEXY.<lang>.ext', () => {
    const p = targetPath({
      animePath: 'C:\\data\\anime',
      animeSlug: 'Naruto',
      seasonNumber: 1,
      episodeNumber: 13,
      language: 'SUB_ITA',
      ext: 'mp4',
    });
    expect(p).toBe(['C:\\data\\anime', 'naruto', 'Season 01', 'S01E13.sub_ita.mp4'].join(sep));
  });

  it('slug con caratteri speciali viene sanificato', () => {
    const p = targetPath({
      animePath: 'C:\\data\\anime',
      animeSlug: 'Darling in the FranXX',
      seasonNumber: 2,
      episodeNumber: 1,
      language: 'DUB_ITA',
      ext: 'mp4',
    });
    const expected = join(
      'C:\\data\\anime',
      'darling-in-the-franxx',
      'Season 02',
      'S02E01.dub_ita.mp4',
    );
    expect(p).toBe(expected);
  });
});

describe('tempPath', () => {
  it('aggiunge suffisso .part.<queueId> al target', () => {
    const target = join('C:\\data\\anime', 'naruto', 'Season 01', 'S01E01.sub_ita.mp4');
    const t = tempPath(target, 'abc-123');
    expect(t).toBe(`${target}.part.abc-123`);
  });
});

describe('ensureDir + atomicMove (filesystem reale, cartella tmp)', () => {
  let work: string;

  beforeEach(async () => {
    work = await mkdtemp(join(tmpdir(), 'au-fs-'));
  });
  afterEach(async () => {
    await rm(work, { recursive: true, force: true });
  });

  it('ensureDir crea cartelle ricorsive', async () => {
    const dir = join(work, 'a/b/c');
    await ensureDir(dir);
    const s = await stat(dir);
    expect(s.isDirectory()).toBe(true);
  });

  it('ensureDir è idempotente (EEXIST non solleva)', async () => {
    const dir = join(work, 'a');
    await ensureDir(dir);
    await ensureDir(dir);
  });

  it('atomicMove sposta il file e crea la cartella di destinazione', async () => {
    const from = join(work, 'src.mp4');
    const toDir = join(work, 'dest/sub');
    const to = join(toDir, 'S01E01.mp4');
    await (await import('node:fs/promises')).writeFile(from, 'mp4-content');
    await atomicMove(from, to, testLogger);

    const got = await readFile(to, 'utf8');
    expect(got).toBe('mp4-content');
    await expect(stat(from)).rejects.toThrow();
  });
});
