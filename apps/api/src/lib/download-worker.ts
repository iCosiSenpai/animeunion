import { EventEmitter } from 'node:events';
import { dirname } from 'node:path';
import type { Language } from '@animeunion/shared';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import type { CatalogService } from '../services/catalog-service';
import type { ConfigService } from '../services/config-service';
import type { RenamerService } from '../services/renamer-service';
import { atomicMove, ensureDir, freeDiskBytes, sweepPartFiles, tempPath } from './download-fs';
import { DownloadAbortedError, type DownloadProgress, downloadToFile } from './http-downloader';
import type { Logger } from './logger';

export type WorkerEvent = 'enqueue' | 'start' | 'progress' | 'complete' | 'failed' | 'cancelled';

export interface WorkerEvents {
  enqueue: [{ queueId: string; episodeFileId: string }];
  start: [{ queueId: string; episodeFileId: string }];
  progress: [
    { queueId: string; episodeFileId: string; bytesDownloaded: number; totalBytes: number | null },
  ];
  complete: [{ queueId: string; episodeFileId: string; localPath: string; bytes: number }];
  failed: [{ queueId: string; episodeFileId: string; error: string; retry: boolean }];
  cancelled: [{ queueId: string; episodeFileId: string }];
}

interface InFlight {
  controller: AbortController;
}

export interface DownloadWorker {
  start(): void;
  stop(): void;
  on<E extends keyof WorkerEvents>(event: E, listener: (...args: WorkerEvents[E]) => void): void;
  off<E extends keyof WorkerEvents>(event: E, listener: (...args: WorkerEvents[E]) => void): void;
  /**
   * Tenta di fare partire il prossimo job (controlla maxConcurrent). Da chiamare
   * su 'enqueue' o dopo che un job finisce. È idempotente.
   */
  tryStartNext(): Promise<void>;
  /** Inserisce un nuovo job in coda. Se esiste già per lo stesso episodeFileId, ritorna quello esistente. */
  enqueue(episodeFileId: string, priority?: number): string;
  /** Cancella un job. Se era in downloading, interrompe l'AbortController. */
  cancel(queueId: string): boolean;
  /** Riavvia un job in failed (azzera retry_count). */
  retry(queueId: string): boolean;
  /** Mette in pausa la coda: i job in corso continuano, non ne partono di nuovi. */
  pause(): void;
  /** Riprende la coda. */
  resume(): void;
  /** Ritorna true se la coda è in pausa. */
  isPaused(): boolean;
}

const SAFETY_TICK_MS = 60_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 60_000;
const MIN_FREE_DISK_BYTES = 500 * 1024 * 1024; // 500 MiB di margine minimo

function backoffMs(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
}

export interface DownloadWorkerDeps {
  db: Db;
  catalog: CatalogService;
  config: ConfigService;
  logger: Logger;
  renamer: RenamerService;
}

export function createDownloadWorker(deps: DownloadWorkerDeps): DownloadWorker {
  const { db, catalog, config, logger, renamer } = deps;
  const emitter = new EventEmitter();
  const inFlight = new Map<string, InFlight>();

  let timer: NodeJS.Timeout | null = null;
  let stopped = true;
  let paused = false;

  function updateQueue(
    queueId: string,
    fields: Partial<typeof schema.downloadQueue.$inferInsert>,
  ): void {
    db.update(schema.downloadQueue).set(fields).where(eq(schema.downloadQueue.id, queueId)).run();
  }

  function activeCount(): number {
    const rows = db
      .select({ id: schema.downloadQueue.id })
      .from(schema.downloadQueue)
      .where(inArray(schema.downloadQueue.status, ['downloading', 'processing']))
      .all();
    return rows.length;
  }

  function pickNext(): typeof schema.downloadQueue.$inferSelect | null {
    return (
      db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.status, 'queued'))
        .orderBy(desc(schema.downloadQueue.priority), asc(schema.downloadQueue.createdAt))
        .limit(1)
        .get() ?? null
    );
  }

  async function runOne(queueId: string): Promise<void> {
    const item = db
      .select()
      .from(schema.downloadQueue)
      .where(eq(schema.downloadQueue.id, queueId))
      .get();
    // tryStartNext prenota il job (status -> 'downloading') prima di chiamarci:
    // accettiamo lo stato riservato, non 'queued'.
    if (!item || item.status !== 'downloading') {
      return;
    }

    updateQueue(queueId, { progress: 0 });
    const epFile = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.id, item.episodeFileId))
      .get();
    const episode = epFile
      ? db.select().from(schema.episode).where(eq(schema.episode.id, epFile.episodeId)).get()
      : null;
    const anime = episode
      ? db.select().from(schema.anime).where(eq(schema.anime.id, episode.animeId)).get()
      : null;

    if (!epFile || !episode || !anime) {
      const msg = `episode_file / episode / anime non trovato per queue ${queueId}`;
      updateQueue(queueId, { status: 'failed', error: msg, completedAt: new Date().toISOString() });
      emitter.emit('failed', {
        queueId,
        episodeFileId: item.episodeFileId,
        error: msg,
        retry: false,
      });
      void tryStartNext();
      return;
    }

    emitter.emit('start', { queueId, episodeFileId: item.episodeFileId });

    const controller = new AbortController();
    inFlight.set(queueId, { controller });

    try {
      const detail = await catalog.getEpisodeFile(item.episodeFileId);
      const url = detail.downloadUrl;
      if (!url) {
        throw new Error(`URL download mancante per ${item.episodeFileId}`);
      }

      const animePath = config.get('animePath');
      const finalPath = renamer.computeEpisodePath({
        animePath,
        animeId: anime.id,
        episodeNumber: episode.number,
        language: epFile.language as Language,
      });
      const partial = tempPath(finalPath, queueId);
      await ensureDir(dirname(finalPath), logger);

      // Guardia spazio disco: evita di riempire completamente il volume.
      const free = await freeDiskBytes(dirname(finalPath));
      if (free != null && free < MIN_FREE_DISK_BYTES) {
        throw new Error(
          `Spazio su disco insufficiente: ${Math.round(free / 1024 / 1024)} MiB liberi`,
        );
      }

      const onProgress = (p: DownloadProgress): void => {
        const total = p.totalBytes ?? 0;
        const ratio = total > 0 ? p.bytesDownloaded / total : 0;
        updateQueue(queueId, {
          progress: Math.min(Math.max(ratio, 0), 1),
        });
        emitter.emit('progress', {
          queueId,
          episodeFileId: item.episodeFileId,
          bytesDownloaded: p.bytesDownloaded,
          totalBytes: p.totalBytes,
        });
      };

      const result = await downloadToFile({
        url,
        destPath: partial,
        signal: controller.signal,
        onProgress,
      });

      updateQueue(queueId, { status: 'processing', progress: 1 });
      await atomicMove(partial, finalPath, logger);

      const completedAt = new Date().toISOString();
      db.transaction((tx) => {
        tx.update(schema.episodeFile)
          .set({
            downloadStatus: 'downloaded',
            localPath: finalPath,
            fileSize: result.bytes,
            downloadedAt: completedAt,
            updatedAt: completedAt,
          })
          .where(eq(schema.episodeFile.id, item.episodeFileId))
          .run();
        tx.update(schema.downloadQueue)
          .set({ status: 'completed', progress: 1, completedAt, error: null })
          .where(eq(schema.downloadQueue.id, queueId))
          .run();
      });

      emitter.emit('complete', {
        queueId,
        episodeFileId: item.episodeFileId,
        localPath: finalPath,
        bytes: result.bytes,
      });
    } catch (error) {
      const aborted = error instanceof DownloadAbortedError || controller.signal.aborted;
      const message = error instanceof Error ? error.message : String(error);
      const wasInFlight = inFlight.delete(queueId);
      if (aborted && wasInFlight) {
        updateQueue(queueId, { status: 'cancelled', completedAt: new Date().toISOString() });
        emitter.emit('cancelled', { queueId, episodeFileId: item.episodeFileId });
        return;
      }
      const retryCount = item.retryCount ?? 0;
      const retryMax = item.retryMax ?? 3;
      const nextRetry = retryCount + 1;
      if (nextRetry < retryMax) {
        updateQueue(queueId, {
          status: 'queued',
          retryCount: nextRetry,
          error: message,
          progress: 0,
        });
        emitter.emit('failed', {
          queueId,
          episodeFileId: item.episodeFileId,
          error: message,
          retry: true,
        });
        const wait = backoffMs(nextRetry);
        setTimeout(() => {
          void tryStartNext();
        }, wait).unref?.();
      } else {
        updateQueue(queueId, {
          status: 'failed',
          error: message,
          completedAt: new Date().toISOString(),
        });
        emitter.emit('failed', {
          queueId,
          episodeFileId: item.episodeFileId,
          error: message,
          retry: false,
        });
      }
    } finally {
      inFlight.delete(queueId);
      void tryStartNext();
    }
  }

  async function tryStartNext(): Promise<void> {
    if (stopped || paused) {
      return;
    }
    while (activeCount() < config.get('maxConcurrent')) {
      const next = pickNext();
      if (!next) {
        return;
      }
      // Prenota atomicamente: setta downloading solo se ancora queued.
      const result = db
        .update(schema.downloadQueue)
        .set({ status: 'downloading', startedAt: new Date().toISOString() })
        .where(and(eq(schema.downloadQueue.id, next.id), eq(schema.downloadQueue.status, 'queued')))
        .run();
      if (result.changes === 0) {
        continue; // qualcun altro l'ha preso
      }
      void runOne(next.id);
    }
  }

  function safetyTick(): void {
    // Copre il caso crash/restart: riavvia i queued dimenticati e fa partire nuovi job.
    if (stopped) {
      return;
    }
    void tryStartNext();
  }

  function reconcileOrphans(): void {
    // All'avvio nessun download e' davvero in volo: le righe lasciate 'downloading' o
    // 'processing' da un processo precedente sono orfane. Le marchiamo come interrotte
    // (failed) cosi' restano cancellabili/riavviabili dalla UI invece di bloccarsi.
    const completedAt = new Date().toISOString();
    const result = db
      .update(schema.downloadQueue)
      .set({ status: 'failed', error: 'Interrotto da riavvio del server', completedAt })
      .where(inArray(schema.downloadQueue.status, ['downloading', 'processing']))
      .run();
    if (result.changes > 0) {
      logger.warn(
        { count: result.changes },
        "Download orfani trovati all'avvio e segnati come interrotti",
      );
    }
  }

  const worker: DownloadWorker = {
    start(): void {
      if (!stopped) {
        return;
      }
      stopped = false;
      paused = false;
      reconcileOrphans();
      // Pulizia best-effort dei .part rimasti da un crash precedente.
      void sweepPartFiles(config.get('animePath'), logger)
        .then((n) => {
          if (n > 0) {
            logger.info({ removed: n }, "File .part orfani rimossi all'avvio");
          }
        })
        .catch(() => {});
      timer = setInterval(safetyTick, SAFETY_TICK_MS);
      timer.unref?.();
      logger.info(
        { everyMs: SAFETY_TICK_MS, maxConcurrent: config.get('maxConcurrent') },
        'Download worker avviato',
      );
      void tryStartNext();
    },

    stop(): void {
      stopped = true;
      paused = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      for (const inflight of inFlight.values()) {
        inflight.controller.abort();
      }
      inFlight.clear();
      logger.info('Download worker fermato');
    },

    pause() {
      if (stopped || paused) {
        return;
      }
      paused = true;
      logger.info('Coda download messa in pausa');
    },

    resume() {
      if (stopped || !paused) {
        return;
      }
      paused = false;
      logger.info('Coda download ripresa');
      void tryStartNext();
    },

    isPaused() {
      return paused;
    },

    on(event, listener) {
      emitter.on(event, listener as (...args: unknown[]) => void);
    },

    off(event, listener) {
      emitter.off(event, listener as (...args: unknown[]) => void);
    },

    async tryStartNext() {
      await tryStartNext();
    },

    enqueue(episodeFileId, priority) {
      const existing = db
        .select({ id: schema.downloadQueue.id, status: schema.downloadQueue.status })
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.episodeFileId, episodeFileId))
        .get();
      if (existing) {
        return existing.id;
      }
      const id = crypto.randomUUID();
      db.insert(schema.downloadQueue)
        .values({
          id,
          episodeFileId,
          status: 'queued',
          priority: priority ?? 50,
          createdAt: new Date().toISOString(),
        })
        .run();
      emitter.emit('enqueue', { queueId: id, episodeFileId });
      void tryStartNext();
      return id;
    },

    cancel(queueId) {
      const item = db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.id, queueId))
        .get();
      if (!item) {
        return false;
      }
      if (item.status === 'queued') {
        updateQueue(queueId, { status: 'cancelled', completedAt: new Date().toISOString() });
        emitter.emit('cancelled', { queueId, episodeFileId: item.episodeFileId });
        return true;
      }
      if (item.status === 'downloading' || item.status === 'processing') {
        const inflight = inFlight.get(queueId);
        if (inflight) {
          inflight.controller.abort();
          return true;
        }
        // Orfano: il processo che lo scaricava non c'e' piu' (es. dopo un riavvio),
        // quindi non c'e' nulla da abortire. Lo chiudiamo direttamente come cancelled.
        updateQueue(queueId, { status: 'cancelled', completedAt: new Date().toISOString() });
        emitter.emit('cancelled', { queueId, episodeFileId: item.episodeFileId });
        return true;
      }
      return false;
    },

    retry(queueId) {
      const item = db
        .select()
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.id, queueId))
        .get();
      if (!item || item.status !== 'failed') {
        return false;
      }
      updateQueue(queueId, { status: 'queued', retryCount: 0, error: null, progress: 0 });
      emitter.emit('enqueue', { queueId, episodeFileId: item.episodeFileId });
      void tryStartNext();
      return true;
    },
  };

  return worker;
}
