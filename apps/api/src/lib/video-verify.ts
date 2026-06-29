import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import type { Logger } from './logger';

/**
 * Verifica l'integrità di un file video decodificandolo interamente con ffmpeg e scartando l'output
 * (`-f null -`). A differenza del controllo Content-Length / magic-bytes del downloader, questo
 * cattura le corruzioni a metà file (CDN che chiude la connessione, byte sporchi). `-xerror` fa
 * uscire ffmpeg con codice != 0 al primo errore di decodifica.
 *
 * È volutamente opt-in (config `verifyDownloads`): decodificare l'intero file costa CPU/tempo.
 */

const DEFAULT_TIMEOUT_MS = 120_000;

export interface VideoVerifyResult {
  ok: boolean;
  /** true se la verifica non è stata possibile (ffmpeg assente/non eseguibile): non bloccare. */
  skipped?: boolean;
  reason?: string;
}

export interface VideoVerifyOptions {
  timeoutMs?: number;
  logger?: Logger;
  /** Override del path ffmpeg (per i test). `undefined` = usa ffmpeg-static; `null` = non disponibile. */
  ffmpegBin?: string | null;
}

export async function verifyVideoFile(
  filePath: string,
  options: VideoVerifyOptions = {},
): Promise<VideoVerifyResult> {
  const bin = options.ffmpegBin !== undefined ? options.ffmpegBin : ffmpegPath;
  if (!bin) {
    options.logger?.warn('ffmpeg non disponibile: verifica integrità saltata');
    return { ok: true, skipped: true };
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<VideoVerifyResult>((resolvePromise) => {
    let settled = false;
    const finish = (result: VideoVerifyResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolvePromise(result);
    };

    const child = spawn(bin, ['-v', 'error', '-xerror', '-i', filePath, '-f', 'null', '-'], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ ok: false, reason: `verifica in timeout dopo ${Math.round(timeoutMs / 1000)}s` });
    }, timeoutMs);
    timer.unref?.();

    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < 4000) {
        stderr += chunk.toString();
      }
    });

    child.on('error', (err) => {
      // Impossibile eseguire ffmpeg: non bloccare il download, ma segnalalo.
      options.logger?.warn({ err }, 'Esecuzione di ffmpeg per la verifica fallita');
      finish({ ok: true, skipped: true, reason: err.message });
    });

    child.on('close', (code) => {
      if (code === 0) {
        finish({ ok: true });
        return;
      }
      finish({
        ok: false,
        reason: stderr.trim().slice(0, 300) || `ffmpeg uscito con codice ${code}`,
      });
    });
  });
}
