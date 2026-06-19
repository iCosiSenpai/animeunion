import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testLogger } from '../test/helpers';
import {
  atomicMove,
  ensureDir,
  pad2,
  sanitizeSlugForFs,
  sanitizeTitleForFs,
  sweepPartFiles,
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

describe('sanitizeTitleForFs', () => {
  it('mantiene spazi e maiuscole, rimuove i caratteri illegali', () => {
    expect(sanitizeTitleForFs('Koori no Jouheki')).toBe('Koori no Jouheki');
    expect(sanitizeTitleForFs('Re:Zero / Season?')).toBe('ReZero Season');
  });

  it('rimuove punto/spazio finale (Windows) e cade su "Anime" se vuoto', () => {
    expect(sanitizeTitleForFs('Titolo. ')).toBe('Titolo');
    expect(sanitizeTitleForFs(':*?')).toBe('Anime');
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

  it('sweepPartFiles rimuove i .part lasciando intatti gli altri file', async () => {
    const dir = join(work, 'sub-ita', 'show', 'Season 01');
    await mkdir(dir, { recursive: true });
    const partial = join(dir, 'S01E01.mp4.part.abc123');
    const real = join(dir, 'S01E02.mp4');
    await writeFile(partial, 'partial');
    await writeFile(real, 'video');

    const removed = await sweepPartFiles(work, testLogger);
    expect(removed).toBe(1);
    expect(existsSync(partial)).toBe(false);
    expect(existsSync(real)).toBe(true);
  });

  it('sweepPartFiles tollera una cartella inesistente', async () => {
    const removed = await sweepPartFiles(join(work, 'non-esiste'), testLogger);
    expect(removed).toBe(0);
  });
});
