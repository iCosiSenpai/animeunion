import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from './logger';

/**
 * Utility per il download engine: naming FS-safe e atomicità del rename.
 *
 * Convenzione del path finale (immutata in STEP 3 quando aggiungeremo sub-ita/dub-ita e
 * il fix sequel renumbering): `<animePath>/<slug-sanificato>/Season <NN>/<SXXEXX>.mp4`.
 */

const UNSAFE_CHARS = /[^\p{L}\p{N}\-_ ]/gu;
const COMBINING_MARKS = /\p{M}/gu;

export function sanitizeSlugForFs(slug: string): string {
  return (
    slug
      .normalize('NFKD')
      .replace(COMBINING_MARKS, '')
      .toLowerCase()
      .replace(UNSAFE_CHARS, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 200) || 'anime'
  );
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export interface TargetPathInput {
  animePath: string;
  animeSlug: string;
  seasonNumber: number;
  episodeNumber: number;
  language: string;
  ext: string;
}

export function targetPath(input: TargetPathInput): string {
  const dir = join(
    input.animePath,
    sanitizeSlugForFs(input.animeSlug),
    `Season ${pad2(input.seasonNumber)}`,
  );
  const langSuffix = input.language ? `.${input.language.toLowerCase()}` : '';
  const file = `S${pad2(input.seasonNumber)}E${pad2(input.episodeNumber)}${langSuffix}.${input.ext}`;
  return join(dir, file);
}

export function tempPath(target: string, queueId: string): string {
  return `${target}.part.${queueId}`;
}

export async function ensureDir(dir: string, logger?: Logger): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return;
    }
    logger?.error({ err: error, dir }, 'Creazione cartella fallita');
    throw error;
  }
}

/**
 * Sposta atomicamente `from` in `to`. Garantisce che la cartella di destinazione esista
 * (creandola ricorsivamente). Su filesystem locali (ext4/ntfs/apfs) `rename` è atomico:
 * il consumer (Jellyfin/Plex) vede o il nome vecchio o quello nuovo, mai un mix.
 */
export async function atomicMove(from: string, to: string, logger?: Logger): Promise<void> {
  const { dirname } = await import('node:path');
  await ensureDir(dirname(to), logger);
  await rename(from, to);
}
