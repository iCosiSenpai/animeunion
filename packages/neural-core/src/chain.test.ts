import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NeuralExportProfile } from '@animeunion/shared';
import { describe, expect, it } from 'vitest';
import { buildShaderChain, concatShaderSources } from './chain';

describe('concatShaderSources', () => {
  it('unisce i sorgenti nell ordine dato', () => {
    expect(concatShaderSources(['//A', '//B', '//C'])).toBe('//A\n//B\n//C');
  });
});

describe('buildShaderChain', () => {
  it('legge la catena nell ordine del profilo e scrive il file combinato', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nc-chain-'));
    await writeFile(join(dir, 'restore.glsl'), '//RESTORE', 'utf8');
    await writeFile(join(dir, 'upscale.glsl'), '//UPSCALE', 'utf8');
    const profile: NeuralExportProfile = {
      id: 'xq',
      chain: ['restore.glsl', 'upscale.glsl'],
      targetWidth: 1920,
      targetHeight: 1080,
      videoBitrate: '10M',
      videoCodec: 'libx264',
      audio: 'copy',
      faststart: true,
    };
    const out = join(dir, 'chain.glsl');
    const written = await buildShaderChain(profile, dir, out);
    expect(written).toBe(out);
    expect(await readFile(out, 'utf8')).toBe('//RESTORE\n//UPSCALE');
  });
});
