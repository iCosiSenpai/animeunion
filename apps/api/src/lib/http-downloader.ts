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

/**
 * Errore "permanente": riprovare non ha senso (4xx, link scaduto che torna HTML/JSON,
 * contenuto non video). Il worker NON deve fare retry su questi.
 */
export class PermanentDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentDownloadError';
  }
}

/**
 * Errore "ambientale": il download e' fallito per una condizione dell'ambiente (cartella non
 * scrivibile, I-O, spazio disco) e NON per la sorgente. Recuperabile: quando il Doctor rileva il
 * ripristino (es. cartella tornata scrivibile) i job falliti cosi' vengono ri-accodati in automatico
 * (vedi download-worker.retryEnvFailed). Distinto dagli errno FS grezzi per non fare string-matching.
 */
export class EnvironmentDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentDownloadError';
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
  /** Byte già presenti su disco: se >0 prova a riprendere via header Range. */
  resumeFrom?: number;
}

const DEFAULT_PROGRESS_INTERVAL_MS = 200;
const DEFAULT_STALL_TIMEOUT_MS = 60_000;

/**
 * Riconosce l'inizio di un file video valido dai magic bytes del primo chunk: box MP4/MOV
 * (`ftyp` ai byte 4-7) o container Matroska/WebM (EBML `1A 45 DF A3`). Se il chunk e' troppo
 * corto per giudicare ritorna true (non bloccare).
 */
function looksLikeVideoStart(chunk: Buffer): boolean {
  if (chunk.length < 8) {
    return true;
  }
  if (chunk[4] === 0x66 && chunk[5] === 0x74 && chunk[6] === 0x79 && chunk[7] === 0x70) {
    return true; // 'ftyp' -> MP4/MOV
  }
  if (chunk[0] === 0x1a && chunk[1] === 0x45 && chunk[2] === 0xdf && chunk[3] === 0xa3) {
    return true; // EBML -> MKV/WebM
  }
  return false;
}

/**
 * Vero se i primi byte sono tutti testo ASCII stampabile (con tab/CR/LF): tipico delle pagine di
 * errore ("link scaduto", "Forbidden") servite al posto del video. Combinata con
 * `!looksLikeVideoStart` permette di rifiutare gli errori testuali SENZA rischiare falsi positivi
 * su contenuti binari/video validi (che contengono subito byte non stampabili).
 */
function looksLikeText(chunk: Buffer): boolean {
  const n = Math.min(chunk.length, 64);
  if (n === 0) {
    return false;
  }
  for (let i = 0; i < n; i++) {
    const b = chunk[i] as number;
    if (b === 0x09 || b === 0x0a || b === 0x0d) {
      continue;
    }
    if (b < 0x20 || b > 0x7e) {
      return false;
    }
  }
  return true;
}

export async function downloadToFile(options: DownloadOptions): Promise<DownloadResult> {
  const {
    url,
    destPath,
    onProgress,
    signal,
    progressIntervalMs = DEFAULT_PROGRESS_INTERVAL_MS,
    stallTimeoutMs = DEFAULT_STALL_TIMEOUT_MS,
    headers,
    resumeFrom = 0,
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
  const reqHeaders: Record<string, string> = { ...headers };
  if (resumeFrom > 0) {
    reqHeaders.range = `bytes=${resumeFrom}-`;
  }
  const response = await request(url, {
    method: 'GET',
    signal: internal.signal,
    headers: reqHeaders,
  });

  // 416 = il .part è già >= della sorgente: riparti pulito (transitorio).
  if (response.statusCode === 416) {
    await response.body.dump().catch(() => {});
    await rm(destPath).catch(() => {});
    throw new Error('Range non soddisfacibile (riavvio download da zero)');
  }

  if (response.statusCode >= 400) {
    const body = await response.body.text().catch(() => '');
    const message = `Download fallito (HTTP ${response.statusCode}): ${body.slice(0, 200) || 'no body'}`;
    // 4xx = errore permanente (link scaduto/non autorizzato): inutile riprovare.
    // 5xx = transitorio: lascia che il worker riprovi.
    throw response.statusCode < 500 ? new PermanentDownloadError(message) : new Error(message);
  }

  // Resume effettivo solo se il server risponde 206; con 200 ha ignorato il Range → da zero.
  const resuming = resumeFrom > 0 && response.statusCode === 206;
  const startAt = resuming ? resumeFrom : 0;

  const contentType: string | null = (() => {
    const raw = response.headers['content-type'];
    if (raw == null) {
      return null;
    }
    return Array.isArray(raw) ? (raw[0] ?? null) : raw;
  })();
  const totalBytes: number | null = (() => {
    if (resuming) {
      // Content-Range: bytes start-end/total
      const cr = response.headers['content-range'];
      const value = Array.isArray(cr) ? cr[0] : cr;
      const match = value?.match(/\/(\d+)\s*$/);
      if (match?.[1]) {
        return Number.parseInt(match[1], 10);
      }
    }
    const totalHeader = response.headers['content-length'];
    const totalHeaderValue = Array.isArray(totalHeader) ? totalHeader[0] : totalHeader;
    const len = totalHeaderValue ? Number.parseInt(totalHeaderValue, 10) : null;
    return len != null ? len + startAt : null;
  })();

  // Il server può rispondere 200 con una pagina HTML ("link scaduto") invece del video:
  // la rifiutiamo prima di creare il file, così non finisce in libreria come .mp4 rotto.
  if (contentType && /^(?:text\/|application\/(?:json|xml|xhtml))/i.test(contentType)) {
    const preview = await response.body.text().catch(() => '');
    throw new PermanentDownloadError(
      `Risposta non video (content-type: ${contentType})${preview ? `: ${preview.slice(0, 120)}` : ''}`,
    );
  }

  if (onProgress) {
    onProgress({ bytesDownloaded: startAt, totalBytes });
  }

  // Append se stiamo riprendendo (206); altrimenti tronca/sovrascrive.
  const fileStream = createWriteStream(destPath, { flags: resuming ? 'a' : 'w' });
  let bytesDownloaded = startAt;
  let lastEmit = 0;
  // In resume non sniffiamo il primo chunk: non è l'inizio del file.
  let sniffed = resuming;
  let lastActivity = Date.now();
  let stalled = false;

  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb): void {
      lastActivity = Date.now();
      if (!sniffed) {
        sniffed = true;
        // '<' = HTML, '{' = JSON: non è un contenuto binario/video.
        if (chunk[0] === 0x3c || chunk[0] === 0x7b) {
          cb(
            new PermanentDownloadError(
              'Contenuto scaricato non valido (sembra HTML/JSON, non un video)',
            ),
          );
          return;
        }
        // Nessuna firma video ma contenuto testuale: pagina di errore servita come video
        // (es. "link scaduto"/"Forbidden" senza '<'/'{' iniziale). I binari validi passano.
        if (!looksLikeVideoStart(chunk) && looksLikeText(chunk)) {
          cb(new PermanentDownloadError('Contenuto scaricato non valido (testo, non un video)'));
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
    // Conserva il .part sugli errori TRANSITORI (stallo/rete/5xx) per poter riprendere;
    // rimuovilo solo se il contenuto è invalido (permanente) o se l'utente ha annullato.
    const permanent = error instanceof PermanentDownloadError;
    const userAbort = !stalled && signal?.aborted === true;
    if (permanent || userAbort) {
      await rm(destPath).catch(() => {});
    }
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

  // Verifica integrità: se il server aveva dichiarato la dimensione (Content-Length/Range) ma
  // abbiamo ricevuto meno byte, il file è troncato. Errore TRANSITORIO: conserviamo il .part e il
  // worker può riprovare/riprendere, invece di accettare un .mp4 rotto in libreria.
  if (totalBytes != null && bytesDownloaded !== totalBytes) {
    throw new Error(`Download incompleto: ricevuti ${bytesDownloaded}/${totalBytes} byte`);
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
