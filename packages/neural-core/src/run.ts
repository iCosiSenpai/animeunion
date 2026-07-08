import { spawn } from 'node:child_process';

/**
 * Esegue ffmpeg per l'upscale. Ritorna esito + codice; non lancia sull'errore di spawn (ffmpeg
 * assente): risolve `{ ok:false }` cosi' il chiamante puo' degradare. Supporta cancel via AbortSignal
 * e progress opzionale (parsing di `time=` dallo stderr se e' nota la durata).
 */

export interface RunUpscaleInput {
  ffmpegBin: string;
  args: string[];
  cwd?: string;
  signal?: AbortSignal;
  /** Durata sorgente in secondi: se fornita, abilita il calcolo del progress da `time=`. */
  totalDurationSec?: number;
  onProgress?: (fraction: number) => void;
  /** Timeout di sicurezza. Default: nessun timeout (il render 4K puo' durare a lungo). */
  timeoutMs?: number;
}

export interface RunUpscaleResult {
  ok: boolean;
  code: number | null;
  /** true se lo spawn di ffmpeg e' fallito (binario assente). */
  spawnFailed?: boolean;
  /** true se annullato via signal. */
  aborted?: boolean;
  stderr: string;
}

const TIME_RE = /time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g;

/** Estrae la frazione [0..1] dall'ultimo `time=` presente in un chunk stderr, data la durata totale. */
export function parseProgress(stderrChunk: string, totalDurationSec: number): number | null {
  if (totalDurationSec <= 0) {
    return null;
  }
  let match: RegExpExecArray | null;
  let last: number | null = null;
  TIME_RE.lastIndex = 0;
  // biome-ignore lint/suspicious/noAssignInExpressions: idioma standard per exec globale
  while ((match = TIME_RE.exec(stderrChunk)) !== null) {
    const h = Number(match[1]);
    const m = Number(match[2]);
    const s = Number(match[3]);
    last = h * 3600 + m * 60 + s;
  }
  if (last == null) {
    return null;
  }
  return Math.max(0, Math.min(1, last / totalDurationSec));
}

export function runUpscale(input: RunUpscaleInput): Promise<RunUpscaleResult> {
  return new Promise<RunUpscaleResult>((resolvePromise) => {
    let settled = false;
    let stderr = '';
    const finish = (result: RunUpscaleResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      resolvePromise(result);
    };

    if (input.signal?.aborted) {
      finish({ ok: false, code: null, aborted: true, stderr: '' });
      return;
    }

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(input.ffmpegBin, input.args, {
        cwd: input.cwd,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
    } catch {
      finish({ ok: false, code: null, spawnFailed: true, stderr: '' });
      return;
    }

    const onAbort = (): void => {
      child.kill('SIGKILL');
      finish({ ok: false, code: null, aborted: true, stderr: stderr.slice(-2000) });
    };
    input.signal?.addEventListener('abort', onAbort, { once: true });

    const timer = input.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGKILL');
          finish({ ok: false, code: null, stderr: stderr.slice(-2000) });
        }, input.timeoutMs)
      : null;
    timer?.unref?.();

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      if (stderr.length > 8000) {
        stderr = stderr.slice(-8000);
      }
      if (input.onProgress && input.totalDurationSec) {
        const fraction = parseProgress(text, input.totalDurationSec);
        if (fraction != null) {
          input.onProgress(fraction);
        }
      }
    });

    child.on('error', () => {
      input.signal?.removeEventListener('abort', onAbort);
      finish({ ok: false, code: null, spawnFailed: true, stderr: stderr.slice(-2000) });
    });
    child.on('close', (code) => {
      input.signal?.removeEventListener('abort', onAbort);
      finish({ ok: code === 0, code, stderr: stderr.slice(-2000) });
    });
  });
}
