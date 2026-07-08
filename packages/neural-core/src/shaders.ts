import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NeuralExportShader } from '@animeunion/shared';
import { fetch as undiciFetch } from 'undici';

/**
 * Provisioning degli shader Anime4K: scarica ogni file, ne verifica lo sha256 pinnato e lo cacha su
 * disco. Gli shader sono pubblici (MIT) su `/static/anime4k/`: nessun token richiesto. Iniettare
 * `fetchImpl` nei test (undici MockAgent) per non colpire la rete.
 */

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export type FetchLike = (url: string) => Promise<FetchResponseLike>;

export interface ProvisionResult {
  file: string;
  path: string;
  /** true se era gia' in cache con hash valido (nessun download). */
  cached: boolean;
}

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

const defaultFetch: FetchLike = (url) => undiciFetch(url);

export async function provisionShaders(
  shaders: NeuralExportShader[],
  cacheDir: string,
  fetchImpl: FetchLike = defaultFetch,
): Promise<ProvisionResult[]> {
  await mkdir(cacheDir, { recursive: true });
  const results: ProvisionResult[] = [];
  for (const shader of shaders) {
    const expected = shader.sha256.toLowerCase();
    const dest = join(cacheDir, shader.file);

    // Gia' in cache con hash valido: salta il download.
    const existing = await readFile(dest).catch(() => null);
    if (existing && sha256Hex(existing) === expected) {
      results.push({ file: shader.file, path: dest, cached: true });
      continue;
    }

    const res = await fetchImpl(shader.url);
    if (!res.ok) {
      throw new Error(`Download shader fallito (HTTP ${res.status}): ${shader.file}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const got = sha256Hex(buf);
    if (got !== expected) {
      throw new Error(
        `sha256 non combacia per ${shader.file}: atteso ${expected}, ottenuto ${got}`,
      );
    }
    await writeFile(dest, buf);
    results.push({ file: shader.file, path: dest, cached: false });
  }
  return results;
}
