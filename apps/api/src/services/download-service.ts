import type { DownloadAddByRefInput, Language } from '@animeunion/shared';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import type { DownloadWorker } from '../lib/download-worker';
import { NotFoundError, PreconditionError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import type { CatalogService } from './catalog-service';
import type { ConfigService } from './config-service';

export interface DownloadQueueItem {
  id: string;
  episodeFileId: string;
  status: 'queued' | 'downloading' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  bytesDownloaded: number;
  totalBytes: number | null;
  speedBps: number | null;
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
  /**
   * Accoda un episodio identificato da (slug, numero, lingua): garantisce prima che l'anime
   * e i suoi episodi siano in cache, poi risolve l'episode_file e accoda. Usato dalla home.
   */
  addEpisodeByRef(input: DownloadAddByRefInput): Promise<string>;
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
  /** Cambia la priorità di un job (0..100); usato da "Scarica prima". */
  setPriority(queueId: string, priority: number): boolean;
  /** Rimuove i job terminali più vecchi di `queueRetentionDays` (chiamato dallo scheduler). */
  purgeOldTerminal(): number;
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

const NOT_CONFIGURED_MSG =
  'Configura le cartelle di download nelle Impostazioni prima di scaricare.';

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
      if (!config.isConfigured()) {
        throw new PreconditionError(NOT_CONFIGURED_MSG);
      }
      const existing = alreadyInQueue(episodeFileId);
      if (existing) {
        return existing;
      }
      const queueId = worker.enqueue(episodeFileId, priority);
      logger.info({ queueId, episodeFileId }, 'Download accodato');
      return queueId;
    },

    async addEpisodeByRef({ slug, episodeNumber, language, priority }) {
      // Garantisce anime+episodi in cache (dopo il fix di parsing è affidabile).
      const detail = await catalog.getBySlug(slug);
      const fileRow = db
        .select({ id: schema.episodeFile.id })
        .from(schema.episodeFile)
        .innerJoin(schema.episode, eq(schema.episodeFile.episodeId, schema.episode.id))
        .where(
          and(
            eq(schema.episode.animeId, detail.id),
            eq(schema.episode.number, episodeNumber),
            eq(schema.episodeFile.language, language),
          ),
        )
        .get();
      if (!fileRow) {
        throw new NotFoundError(
          `Episodio non disponibile: ${slug} ep ${episodeNumber} (${language})`,
        );
      }
      return this.addEpisode({ episodeFileId: fileRow.id, priority });
    },

    addMissing({ animeId, language }) {
      if (!config.isConfigured()) {
        throw new PreconditionError(NOT_CONFIGURED_MSG);
      }
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
          bytesDownloaded: schema.downloadQueue.bytesDownloaded,
          totalBytes: schema.downloadQueue.totalBytes,
          speedBps: schema.downloadQueue.speedBps,
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
        bytesDownloaded: r.bytesDownloaded ?? 0,
        totalBytes: r.totalBytes ?? null,
        speedBps: r.speedBps ?? null,
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
      // Annulla sia i job in coda sia quelli attivi/orfani (downloading/processing):
      // "Annulla tutti" deve fermare davvero ogni download non terminato.
      const rows = db
        .select({ id: schema.downloadQueue.id })
        .from(schema.downloadQueue)
        .where(inArray(schema.downloadQueue.status, ['queued', 'downloading', 'processing']))
        .all();
      let count = 0;
      for (const row of rows) {
        if (worker.cancel(row.id)) {
          count += 1;
        }
      }
      if (count > 0) {
        logger.info({ count }, 'Tutti i download non terminati annullati');
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

    setPriority(queueId, priority) {
      const ok = worker.setPriority(queueId, priority);
      if (ok) {
        logger.info({ queueId, priority }, 'Priorità download aggiornata');
      }
      return ok;
    },

    purgeOldTerminal() {
      const days = config.get('queueRetentionDays');
      const cutoff = new Date(now().getTime() - days * 24 * 60 * 60 * 1000).toISOString();
      const result = db
        .delete(schema.downloadQueue)
        .where(
          and(
            inArray(schema.downloadQueue.status, ['completed', 'cancelled', 'failed']),
            lt(schema.downloadQueue.completedAt, cutoff),
          ),
        )
        .run();
      if (result.changes > 0) {
        logger.info({ removed: result.changes, days }, 'Coda: rimossi job terminali scaduti');
      }
      return result.changes;
    },

    enqueueForWatchingFollows() {
      if (!config.get('autoDownload') || !config.isConfigured()) {
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
