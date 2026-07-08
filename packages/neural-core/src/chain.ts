import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NeuralExportProfile } from '@animeunion/shared';

/**
 * Concatena i sorgenti degli shader di una `chain` in un unico file `.glsl` (formato mpv user-shader,
 * accettato da libplacebo `custom_shader_path`). L'ORDINE della catena e' significativo.
 */

/** Pura: unisce i sorgenti nell'ordine dato. Testabile senza IO. */
export function concatShaderSources(sources: string[]): string {
  return sources.join('\n');
}

/**
 * Legge i file della catena da `cacheDir` (nell'ordine di `profile.chain`), li concatena e scrive il
 * risultato in `outputPath`. Ritorna `outputPath`.
 */
export async function buildShaderChain(
  profile: NeuralExportProfile,
  cacheDir: string,
  outputPath: string,
): Promise<string> {
  const sources: string[] = [];
  for (const file of profile.chain) {
    sources.push(await readFile(join(cacheDir, file), 'utf8'));
  }
  await writeFile(outputPath, concatShaderSources(sources), 'utf8');
  return outputPath;
}
