import { join } from 'node:path';
import { resolveFfmpegPath } from '@animeunion/worker';
import { app } from 'electron';

/**
 * Risolve l'ffmpeg da usare: override `WORKER_FFMPEG_PATH` (per dev/diagnostica) → binario imbarcato
 * nell'app pacchettizzata (`resources/ffmpeg/ffmpeg.exe`) → `ffmpeg` dal PATH. In dev il binario
 * imbarcato non esiste e si ricade sul PATH: si usa `npm run doctor -w @animeunion/worker` o si
 * imposta l'override.
 */
export function resolveAppFfmpeg(): string {
  const candidates: string[] = [];
  if (app.isPackaged) {
    candidates.push(join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe'));
  }
  return resolveFfmpegPath({
    override: process.env.WORKER_FFMPEG_PATH,
    candidates,
  });
}
