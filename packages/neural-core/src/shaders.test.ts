import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NeuralExportShader } from '@animeunion/shared';
import { describe, expect, it, vi } from 'vitest';
import { type FetchLike, provisionShaders } from './shaders';

function sha256(text: string): string {
  return createHash('sha256').update(Buffer.from(text)).digest('hex');
}

function fakeFetch(body: string, ok = true, status = 200): FetchLike {
  return vi.fn(async () => ({
    ok,
    status,
    arrayBuffer: async () => {
      const buf = Buffer.from(body);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    },
  }));
}

describe('provisionShaders', () => {
  it('scarica, verifica lo sha256 e cacha su disco', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nc-sh-'));
    const body = '//shader-content';
    const shaders: NeuralExportShader[] = [
      { file: 's.glsl', url: 'https://x/s.glsl', sha256: sha256(body) },
    ];
    const results = await provisionShaders(shaders, dir, fakeFetch(body));
    expect(results[0]?.cached).toBe(false);
    expect(await readFile(join(dir, 's.glsl'), 'utf8')).toBe(body);
  });

  it('salta il download se gia in cache con hash valido', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nc-sh-'));
    const body = '//cached';
    await writeFile(join(dir, 's.glsl'), body, 'utf8');
    const shaders: NeuralExportShader[] = [
      { file: 's.glsl', url: 'https://x/s.glsl', sha256: sha256(body) },
    ];
    const fetchImpl = fakeFetch(body);
    const results = await provisionShaders(shaders, dir, fetchImpl);
    expect(results[0]?.cached).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('lancia se lo sha256 non combacia', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nc-sh-'));
    const shaders: NeuralExportShader[] = [
      { file: 's.glsl', url: 'https://x/s.glsl', sha256: sha256('atteso') },
    ];
    await expect(provisionShaders(shaders, dir, fakeFetch('diverso'))).rejects.toThrow(/sha256/);
  });

  it('lancia su HTTP non ok', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nc-sh-'));
    const shaders: NeuralExportShader[] = [
      { file: 's.glsl', url: 'https://x/s.glsl', sha256: sha256('x') },
    ];
    await expect(provisionShaders(shaders, dir, fakeFetch('', false, 404))).rejects.toThrow(/404/);
  });
});
