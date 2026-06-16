import { createWriteStream } from 'node:fs';
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

export interface DownloadOptions {
  url: string;
  destPath: string;
  onProgress?: (progress: DownloadProgress) => void;
  signal?: AbortSignal;
  progressIntervalMs?: number;
  headers?: Record<string, string>;
}

const DEFAULT_PROGRESS_INTERVAL_MS = 200;

export async function downloadToFile(options: DownloadOptions): Promise<DownloadResult> {
  const {
    url,
    destPath,
    onProgress,
    signal,
    progressIntervalMs = DEFAULT_PROGRESS_INTERVAL_MS,
    headers,
  } = options;

  const start = Date.now();
  const response = await request(url, {
    method: 'GET',
    signal,
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

  if (onProgress) {
    onProgress({ bytesDownloaded: 0, totalBytes });
  }

  const fileStream = createWriteStream(destPath);
  let bytesDownloaded = 0;
  let lastEmit = 0;

  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb): void {
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

  // undici su Node restituisce body: Readable (Node stream).
  const body = response.body as Readable;

  try {
    await pipeline(body, counter, fileStream);
  } catch (error) {
    if (signal?.aborted) {
      throw new DownloadAbortedError();
    }
    throw error;
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
