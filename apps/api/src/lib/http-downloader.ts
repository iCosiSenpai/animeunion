import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { type Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { request } from 'undici';

/**
 * Downloader MP4 basato su undici. NON usa l'http-client esistente (che fa
 * response.json() e applica un rate-limiter seriale pensato per il sito AnimeUnion).
 * Qui ci serve streaming binario, concorrenza N, nessun rate-limit.
 *
 * Per il flusso MP4: scarica in un .part.<queueId>, poi atomicMove al path finale
 * (vedi download-fs.atomicMove). L'emit di progress è throttled a 1 evento per
 * 200ms per non saturare la pipeline.
 */

export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number | null;
}

export interface DownloadResult {
  bytes: number;
  durationMs: number;
  contentType: string | null;
}

export class DownloadAbortedError extends Error {
  constructor() {
    super('Download aborted');
    this.name = 'DownloadAbortedError';
  }
}

export class DownloadStalledError extends Error {
  constructor(stallMs: number) {
    super(`Download in stallo: nessun dato per ${Math.round(stallMs / 1000)}s`);
    this.name = 'DownloadStalledError';
  }
}

export interface DownloadOptions {
  url: string;
  destPath: string;
  onProgress?: (progress: DownloadProgress) => void;
  signal?: AbortSignal;
  progressIntervalMs?: number;
  headers?: Record<string, string>;
  /** Aborta se non arrivano dati per questo intervallo (default 60s). */
  stallTimeoutMs?: number;
}

const DEFAULT_PROGRESS_INTERVAL_MS = 200;
const DEFAULT_STALL_TIMEOUT_MS = 60_000;

export async function downloadToFile(options: DownloadOptions): Promise<DownloadResult> {
  const {
    url,
    destPath,
    onProgress,
    signal,
    progressIntervalMs = DEFAULT_PROGRESS_INTERVAL_MS,
    stallTimeoutMs = DEFAULT_STALL_TIMEOUT_MS,
    headers,
  } = options;

  // Controller interno: abortito sia dal segnale esterno (cancel utente) sia dallo stall watchdog.
  const internal = new AbortController();
  if (signal) {
    if (signal.aborted) {
      internal.abort();
    } else {
      signal.addEventListener('abort', () => internal.abort(), { once: true });
    }
  }

  const start = Date.now();
  const response = await request(url, {
    method: 'GET',
    signal: internal.signal,
    headers,
  });

  if (response.statusCode >= 400) {
    const body = await response.body.text().catch(() => '');
    throw new Error(
      `Download fallito (HTTP ${response.statusCode}): ${body.slice(0, 200) || 'no body'}`,
    );
  }

  const contentType: string | null = (() => {
    const raw = response.headers['content-type'];
    if (raw == null) {
      return null;
    }
    return Array.isArray(raw) ? (raw[0] ?? null) : raw;
  })();
  const totalHeader = response.headers['content-length'];
  const totalHeaderValue = Array.isArray(totalHeader) ? totalHeader[0] : totalHeader;
  const totalBytes = totalHeaderValue ? Number.parseInt(totalHeaderValue, 10) : null;

  // Il server può rispondere 200 con una pagina HTML ("link scaduto") invece del video:
  // la rifiutiamo prima di creare il file, così non finisce in libreria come .mp4 rotto.
  if (contentType && /^(?:text\/|application\/(?:json|xml|xhtml))/i.test(contentType)) {
    const preview = await response.body.text().catch(() => '');
    throw new Error(
      `Risposta non video (content-type: ${contentType})${preview ? `: ${preview.slice(0, 120)}` : ''}`,
    );
  }

  if (onProgress) {
    onProgress({ bytesDownloaded: 0, totalBytes });
  }

  const fileStream = createWriteStream(destPath);
  let bytesDownloaded = 0;
  let lastEmit = 0;
  let sniffed = false;
  let lastActivity = Date.now();
  let stalled = false;

  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb): void {
      lastActivity = Date.now();
      if (!sniffed) {
        sniffed = true;
        // '<' = HTML, '{' = JSON: non è un contenuto binario/video.
        if (chunk[0] === 0x3c || chunk[0] === 0x7b) {
          cb(new Error('Contenuto scaricato non valido (sembra HTML/JSON, non un video)'));
          return;
        }
      }
      bytesDownloaded += chunk.byteLength;
      if (onProgress) {
        const now = Date.now();
        if (now - lastEmit >= progressIntervalMs) {
          lastEmit = now;
          onProgress({ bytesDownloaded, totalBytes });
        }
      }
      cb(null, chunk);
    },
  });

  // Watchdog: se non arrivano dati per stallTimeoutMs, aborta (CDN bloccato a metà).
  const watchdog = setInterval(
    () => {
      if (Date.now() - lastActivity > stallTimeoutMs) {
        stalled = true;
        internal.abort();
      }
    },
    Math.min(stallTimeoutMs, 5_000),
  );
  watchdog.unref?.();

  // undici su Node restituisce body: Readable (Node stream).
  const body = response.body as Readable;

  try {
    await pipeline(body, counter, fileStream);
  } catch (error) {
    // Rimuove il file parziale rimasto, qualunque sia la causa (abort o errore).
    await rm(destPath).catch(() => {});
    if (stalled) {
      throw new DownloadStalledError(stallTimeoutMs);
    }
    if (signal?.aborted) {
      throw new DownloadAbortedError();
    }
    throw error;
  } finally {
    clearInterval(watchdog);
  }

  if (onProgress) {
    onProgress({ bytesDownloaded, totalBytes });
  }

  return {
    bytes: bytesDownloaded,
    durationMs: Date.now() - start,
    contentType,
  };
}
