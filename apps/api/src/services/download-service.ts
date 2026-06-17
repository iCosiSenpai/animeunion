import type { Language } from '@animeunion/shared';
import { desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import type { DownloadWorker } from '../lib/download-worker';
import type { Logger } from '../lib/logger';
import type { CatalogService } from './catalog-service';
import type { ConfigService } from './config-service';

export interface DownloadQueueItem {
  id: string;
  episodeFileId: string;
  status: 'queued' | 'downloading' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  retryCount: number;
  retryMax: number;
  priority: number;
  createdAt: string;
  // denormalizzato per la UI
  animeId: string;
  animeTitle: string;
  animeSlug: string;
  animeCoverImage: string | null;
  episodeId: string;
  episodeNumber: number;
  episodeTitle: string | null;
  language: Language;
}

export interface DownloadService {
  /** Accende il worker event-driven (chiamato dallo scheduler all'avvio). */
  start(): void;
  /** Ferma il worker: interrompe i job in volo e cancella i tick (chiamato dallo scheduler in shutdown). */
  stop(): void;
  /** Accoda un singolo episode file. Ritorna l'id del job in coda. */
  addEpisode(input: { episodeFileId: string; priority?: number }): string;
  /** Accoda tutti gli episode file non ancora scaricati di un anime (una sola stagione, Regola #13). */
  addMissing(input: { animeId: string; language?: Language }): number;
  /** Sinonimo esplicito di addMissing, per la UI ("Scarica tutti gli episodi mancanti"). */
  addAll(input: { animeId: string; language?: Language }): number;
  /** Lista la coda joinata con episode/anime per la UI. */
  getQueue(): DownloadQueueItem[];
  /** Cancella un job (queued: immediato; downloading: abort). */
  cancel(queueId: string): boolean;
  /** Annulla tutti i job in coda. */
  cancelAll(): number;
  /** Rimette in coda un job in failed. */
  retry(queueId: string): boolean;
  /** Rimette in coda tutti i job falliti. */
  retryAllFailed(): number;
  /** Rimuove dalla tabella gli item terminali. */
  clearCompleted(): number;
  /** Mette in pausa la coda (i job attivi terminano, non ne partono altri). */
  pauseQueue(): boolean;
  /** Riprende la coda. */
  resumeQueue(): boolean;
  /** Ritorna true se la coda è in pausa. */
  isQueuePaused(): boolean;
  /** Accoda nuovi episodi per tutti i follow con status='watching' (chiamato dallo scheduler). */
  enqueueForWatchingFollows(): number;
}

export interface DownloadServiceDeps {
  db: Db;
  worker: DownloadWorker;
  catalog: CatalogService;
  config: ConfigService;
  logger: Logger;
  now?: () => Date;
}

const RETRY_MAX = 3;

function isTerminal(status: string): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'failed';
}

export function createDownloadService(deps: DownloadServiceDeps): DownloadService {
  const { db, worker, catalog, config, logger } = deps;
  const now = deps.now ?? (() => new Date());

  function alreadyInQueue(episodeFileId: string): string | null {
    const existing = db
      .select({ id: schema.downloadQueue.id, status: schema.downloadQueue.status })
      .from(schema.downloadQueue)
      .where(eq(schema.downloadQueue.episodeFileId, episodeFileId))
      .get();
    if (!existing) {
      return null;
    }
    if (isTerminal(existing.status)) {
      return null;
    }
    return existing.id;
  }

  return {
    start(): void {
      worker.start();
    },

    stop(): void {
      worker.stop();
    },

    addEpisode({ episodeFileId, priority }) {
      const existing = alreadyInQueue(episodeFileId);
      if (existing) {
        return existing;
      }
      const queueId = worker.enqueue(episodeFileId, priority);
      logger.info({ queueId, episodeFileId }, 'Download accodato');
      return queueId;
    },

    addMissing({ animeId, language }) {
      const files = db
        .select({
          id: schema.episodeFile.id,
          language: schema.episodeFile.language,
          status: schema.episodeFile.downloadStatus,
        })
        .from(schema.episodeFile)
        .innerJoin(schema.episode, eq(schema.episodeFile.episodeId, schema.episode.id))
        .where(eq(schema.episode.animeId, animeId))
        .all()
        .filter((f) => (language ? f.language === language : true));
      let count = 0;
      for (const file of files) {
        if (file.status === 'downloaded') {
          continue;
        }
        if (alreadyInQueue(file.id)) {
          continue;
        }
        worker.enqueue(file.id);
        count += 1;
      }
      return count;
    },

    addAll({ animeId, language }) {
      return this.addMissing({ animeId, language });
    },

    getQueue() {
      const rows = db
        .select({
          id: schema.downloadQueue.id,
          episodeFileId: schema.downloadQueue.episodeFileId,
          status: schema.downloadQueue.status,
          progress: schema.downloadQueue.progress,
          startedAt: schema.downloadQueue.startedAt,
          completedAt: schema.downloadQueue.completedAt,
          error: schema.downloadQueue.error,
          retryCount: schema.downloadQueue.retryCount,
          retryMax: schema.downloadQueue.retryMax,
          priority: schema.downloadQueue.priority,
          createdAt: schema.downloadQueue.createdAt,
          episodeId: schema.episodeFile.episodeId,
          language: schema.episodeFile.language,
          episodeNumber: schema.episode.number,
          episodeTitle: schema.episode.title,
          animeId: schema.anime.id,
          animeTitle: schema.anime.title,
          animeSlug: schema.anime.slug,
          animeCoverImage: schema.anime.coverImage,
        })
        .from(schema.downloadQueue)
        .innerJoin(
          schema.episodeFile,
          eq(schema.episodeFile.id, schema.downloadQueue.episodeFileId),
        )
        .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
        .innerJoin(schema.anime, eq(schema.anime.id, schema.episode.animeId))
        .orderBy(desc(schema.downloadQueue.priority), desc(schema.downloadQueue.createdAt))
        .all();
      return rows.map((r) => ({
        id: r.id,
        episodeFileId: r.episodeFileId,
        status: r.status as DownloadQueueItem['status'],
        progress: r.progress ?? 0,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        error: r.error,
        retryCount: r.retryCount ?? 0,
        retryMax: r.retryMax ?? RETRY_MAX,
        priority: r.priority ?? 50,
        createdAt: r.createdAt,
        animeId: r.animeId,
        animeTitle: r.animeTitle,
        animeSlug: r.animeSlug,
        animeCoverImage: r.animeCoverImage,
        episodeId: r.episodeId,
        episodeNumber: r.episodeNumber,
        episodeTitle: r.episodeTitle,
        language: r.language as Language,
      }));
    },

    cancel(queueId) {
      const ok = worker.cancel(queueId);
      if (ok) {
        logger.info({ queueId }, 'Download cancellato');
      }
      return ok;
    },

    retry(queueId) {
      const ok = worker.retry(queueId);
      if (ok) {
        logger.info({ queueId }, 'Download rimesso in coda');
      }
      return ok;
    },

    cancelAll() {
      const rows = db
        .select({ id: schema.downloadQueue.id })
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.status, 'queued'))
        .all();
      let count = 0;
      for (const row of rows) {
        if (worker.cancel(row.id)) {
          count += 1;
        }
      }
      if (count > 0) {
        logger.info({ count }, 'Tutti i download in coda annullati');
      }
      return count;
    },

    retryAllFailed() {
      const rows = db
        .select({ id: schema.downloadQueue.id })
        .from(schema.downloadQueue)
        .where(eq(schema.downloadQueue.status, 'failed'))
        .all();
      let count = 0;
      for (const row of rows) {
        if (worker.retry(row.id)) {
          count += 1;
        }
      }
      if (count > 0) {
        logger.info({ count }, 'Tutti i download falliti rimetterti in coda');
      }
      return count;
    },

    pauseQueue() {
      worker.pause();
      return worker.isPaused();
    },

    resumeQueue() {
      worker.resume();
      return worker.isPaused();
    },

    isQueuePaused() {
      return worker.isPaused();
    },

    clearCompleted() {
      const result = db
        .delete(schema.downloadQueue)
        .where(inArray(schema.downloadQueue.status, ['completed', 'cancelled', 'failed']))
        .run();
      if (result.changes > 0) {
        logger.info({ removed: result.changes }, 'Coda download ripulita');
      }
      return result.changes;
    },

    enqueueForWatchingFollows() {
      if (!config.get('autoDownload')) {
        return 0;
      }
      const watching = db
        .select({ id: schema.follow.animeId })
        .from(schema.follow)
        .where(eq(schema.follow.status, 'watching'))
        .all();
      let count = 0;
      for (const f of watching) {
        count += this.addMissing({ animeId: f.id });
      }
      if (count > 0) {
        logger.info({ count, shows: watching.length }, 'Auto-enqueue watching: nuovi accodati');
      }
      return count;
    },
  };
}
