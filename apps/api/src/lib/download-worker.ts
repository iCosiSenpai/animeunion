import { EventEmitter } from 'node:events';
import { rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Language } from '@animeunion/shared';
import { and, asc, desc, eq, inArray, isNull, lte, max, min, or } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import type { CatalogService } from '../services/catalog-service';
import type { ConfigService } from '../services/config-service';
import type { RenamerService } from '../services/renamer-service';
import { atomicMove, ensureDir, freeDiskBytes, sweepPartFiles, tempPath } from './download-fs';
import {
  DownloadAbortedError,
  type DownloadProgress,
  PermanentDownloadError,
  downloadToFile,
} from './http-downloader';
import type { Logger } from './logger';
import { verifyVideoFile } from './video-verify';

/**
 * Limite di default dei download in parallelo quando non e' iniettato `resolveMaxConcurrent`
 * (fallback conservativo). Il download simultaneo (fino a `config.maxConcurrent`) e' un perk Premium:
 * `context.ts` inietta un resolver che onora la config solo se l'utente e' premium, altrimenti 1.
 */
const MAX_CONCURRENT_DOWNLOADS = 1;
/** Tetto assoluto dei download simultanei (coerente con lo schema config: maxConcurrent 1-3). */
const CONCURRENCY_CAP = 3;

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
  /** Cambia la priorità di un job in coda (il worker preleva per priorità desc). */
  setPriority(queueId: string, priority: number): boolean;
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
  /**
   * Limite corrente di download simultanei, ri-valutato ad ogni decisione di scheduling. Assente =
   * fallback a 1 (compat). `context.ts` lo cabla su `isPremiumActive` + `config.maxConcurrent`.
   */
  resolveMaxConcurrent?: () => number | Promise<number>;
}

export function createDownloadWorker(deps: DownloadWorkerDeps): DownloadWorker {
  const { db, catalog, config, logger, renamer } = deps;
  const resolveMaxConcurrent =
    deps.resolveMaxConcurrent ?? ((): number => MAX_CONCURRENT_DOWNLOADS);
  const emitter = new EventEmitter();
  const inFlight = new Map<string, InFlight>();
  // Campionamento per stima velocità (in memoria, non persistito).
  const samples = new Map<
    string,
    { lastBytes: number; lastTs: number; lastWriteTs: number; speed: number }
  >();

  let timer: NodeJS.Timeout | null = null;
  let stopped = true;
  let paused = false;
  // Fairness round-robin: numero di sequenza dell'ultima volta che ogni anime è stato servito (in
  // memoria, resetta al riavvio). A parità di priorità il prossimo job è di un anime servito meno di
  // recente, così un episodio appena uscito di un'altra serie non resta dietro un'intera coda gigante
  // (One Piece) — pur mantenendo "un episodio alla volta" (Regola #13) e la priorità di "Scarica prima".
  let serveSeq = 0;
  const lastServedAnime = new Map<string, number>();

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

  function pickNext(): { id: string; animeId: string } | null {
    // Solo i job accodati e fuori dal backoff: retry_at nel futuro = ancora in attesa (evita il
    // retry a raffica in single-flight). retry_at nullo = mai fallito, quindi eleggibile.
    const now = new Date().toISOString();
    const eligible = and(
      eq(schema.downloadQueue.status, 'queued'),
      or(isNull(schema.downloadQueue.retryAt), lte(schema.downloadQueue.retryAt, now)),
    );
    // Riepilogo per anime dei job in coda (O(#anime), non O(#coda)): priorità massima e job più
    // vecchio di ciascuno. Il join risale download_queue→episode_file→episode→anime (indice 17.1).
    const candidates = db
      .select({
        animeId: schema.episode.animeId,
        prio: max(schema.downloadQueue.priority),
        oldest: min(schema.downloadQueue.createdAt),
      })
      .from(schema.downloadQueue)
      .innerJoin(schema.episodeFile, eq(schema.episodeFile.id, schema.downloadQueue.episodeFileId))
      .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
      .where(eligible)
      .groupBy(schema.episode.animeId)
      .all();
    if (candidates.length === 0) {
      return null;
    }
    // Priorità desc (Scarica prima vince sempre), poi anime servito meno di recente (mai servito =
    // -1 → per primo), poi job più vecchio.
    candidates.sort((a, b) => {
      const pa = a.prio ?? 0;
      const pb = b.prio ?? 0;
      if (pb !== pa) {
        return pb - pa;
      }
      const la = lastServedAnime.get(a.animeId) ?? -1;
      const lb = lastServedAnime.get(b.animeId) ?? -1;
      if (la !== lb) {
        return la - lb;
      }
      return (a.oldest ?? '').localeCompare(b.oldest ?? '');
    });
    const chosenAnime = candidates[0]?.animeId;
    if (!chosenAnime) {
      return null;
    }
    // Il job più prioritario/vecchio dell'anime scelto (sempre fuori dal backoff).
    const job = db
      .select({ id: schema.downloadQueue.id })
      .from(schema.downloadQueue)
      .innerJoin(schema.episodeFile, eq(schema.episodeFile.id, schema.downloadQueue.episodeFileId))
      .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
      .where(and(eligible, eq(schema.episode.animeId, chosenAnime)))
      .orderBy(desc(schema.downloadQueue.priority), asc(schema.downloadQueue.createdAt))
      .limit(1)
      .get();
    return job ? { id: job.id, animeId: chosenAnime } : null;
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

    if (!config.isConfigured()) {
      // Niente cartelle: fallisci subito con messaggio chiaro, senza retry inutili.
      updateQueue(queueId, {
        status: 'failed',
        error: 'Configura le cartelle di download nelle Impostazioni prima di scaricare.',
        completedAt: new Date().toISOString(),
      });
      emitter.emit('failed', {
        queueId,
        episodeFileId: item.episodeFileId,
        error: 'Cartelle di download non configurate',
        retry: false,
      });
      void tryStartNext();
      return;
    }

    emitter.emit('start', { queueId, episodeFileId: item.episodeFileId });

    const controller = new AbortController();
    inFlight.set(queueId, { controller });

    try {
      // forceResolve: ri-risolvi sempre l'URL prima di scaricare (gli URL AnimeUnion scadono;
      // uno cached da un fetch precedente farebbe fallire il job con "link scaduto").
      const detail = await catalog.getEpisodeFile(item.episodeFileId, { forceResolve: true });
      const url = detail.downloadUrl;
      if (!url) {
        throw new Error(`URL download mancante per ${item.episodeFileId}`);
      }

      const finalPath = renamer.computeEpisodePath({
        animeId: anime.id,
        episodeNumber: episode.number,
        language: epFile.language as Language,
      });
      const partial = tempPath(finalPath, queueId);
      await ensureDir(dirname(finalPath), logger);

      // Persisti target e URL prima del download: il target_path abilita il self-healing al
      // riavvio (vedi reconcileOrphans) e il source_url il resume sicuro (vedi sotto).
      updateQueue(queueId, { targetPath: finalPath, sourceUrl: url });

      // Guardia spazio disco: evita di riempire completamente il volume.
      const free = await freeDiskBytes(dirname(finalPath));
      if (free != null && free < MIN_FREE_DISK_BYTES) {
        throw new Error(
          `Spazio su disco insufficiente: ${Math.round(free / 1024 / 1024)} MiB liberi`,
        );
      }

      const onProgress = (p: DownloadProgress): void => {
        const total = p.totalBytes ?? null;
        const ratio = total && total > 0 ? p.bytesDownloaded / total : 0;
        const ts = Date.now();
        const prev = samples.get(queueId);
        let speed = prev?.speed ?? 0;
        if (prev) {
          const dt = (ts - prev.lastTs) / 1000;
          const deltaBytes = p.bytesDownloaded - prev.lastBytes;
          if (dt > 0 && deltaBytes >= 0) {
            const inst = deltaBytes / dt;
            // Media esponenziale per evitare numeri ballerini.
            speed = prev.speed > 0 ? prev.speed * 0.6 + inst * 0.4 : inst;
          }
        }
        const lastWriteTs = prev?.lastWriteTs ?? 0;
        const shouldWrite = ts - lastWriteTs >= 1000;
        samples.set(queueId, {
          lastBytes: p.bytesDownloaded,
          lastTs: ts,
          lastWriteTs: shouldWrite ? ts : lastWriteTs,
          speed,
        });
        // Throttle delle scritture su SQLite (~1/s); la UI fa polling più lento.
        if (shouldWrite) {
          updateQueue(queueId, {
            progress: Math.min(Math.max(ratio, 0), 1),
            bytesDownloaded: p.bytesDownloaded,
            totalBytes: total,
            speedBps: speed,
            // expected_bytes resta la dimensione attesa (Content-Length) anche dopo il
            // completamento, quando total_bytes viene sovrascritto coi byte effettivi.
            ...(total != null ? { expectedBytes: total } : {}),
          });
        }
        emitter.emit('progress', {
          queueId,
          episodeFileId: item.episodeFileId,
          bytesDownloaded: p.bytesDownloaded,
          totalBytes: p.totalBytes,
        });
      };

      // Resume sicuro: riprendi il .part solo se appartiene allo STESSO URL del tentativo
      // precedente. Gli URL AnimeUnion scadono: riprendere un .part scaricato da un URL diverso
      // concatenerebbe byte di sorgenti diverse (file corrotto). In tal caso si riparte da zero.
      const existingPart = await stat(partial)
        .then((s) => s.size)
        .catch(() => 0);
      let resumeFrom = 0;
      if (existingPart > 0) {
        if (item.sourceUrl === url) {
          resumeFrom = existingPart;
        } else {
          await rm(partial).catch(() => {});
          logger.debug({ queueId }, 'URL cambiato: .part precedente scartato, download da zero');
        }
      }

      const result = await downloadToFile({
        url,
        destPath: partial,
        signal: controller.signal,
        onProgress,
        resumeFrom,
      });

      // Verifica integrità opt-in: decodifica il file con ffmpeg prima di finalizzarlo. Se fallisce,
      // il .part e' inutilizzabile (un resume vi appenderebbe sopra) → lo rimuoviamo e lanciamo un
      // errore TRANSITORIO: il worker riprova da zero (un troncamento puo' essere un glitch di rete).
      if (config.get('verifyDownloads')) {
        const verify = await verifyVideoFile(partial, { logger });
        if (!verify.ok) {
          await rm(partial).catch(() => {});
          throw new Error(
            `Verifica integrità fallita: ${verify.reason ?? 'file non riproducibile'}`,
          );
        }
      }

      updateQueue(queueId, { status: 'processing', progress: 1, speedBps: null });
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
          .set({
            status: 'completed',
            progress: 1,
            completedAt,
            error: null,
            bytesDownloaded: result.bytes,
            totalBytes: result.bytes,
            speedBps: null,
          })
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
        updateQueue(queueId, {
          status: 'cancelled',
          completedAt: new Date().toISOString(),
          speedBps: null,
        });
        emitter.emit('cancelled', { queueId, episodeFileId: item.episodeFileId });
        return;
      }
      const retryCount = item.retryCount ?? 0;
      const retryMax = item.retryMax ?? 3;
      const nextRetry = retryCount + 1;
      // Errore permanente (4xx, link scaduto, contenuto non video): niente retry.
      const permanent = error instanceof PermanentDownloadError;
      if (!permanent && nextRetry < retryMax) {
        const wait = backoffMs(nextRetry);
        updateQueue(queueId, {
          status: 'queued',
          retryCount: nextRetry,
          error: message,
          progress: 0,
          bytesDownloaded: 0,
          speedBps: null,
          // Gate del backoff: pickNext non ripescherà questo job finché retry_at non è passato,
          // così il tryStartNext del finally (e i tick) non lo rilanciano a raffica.
          retryAt: new Date(Date.now() + wait).toISOString(),
        });
        emitter.emit('failed', {
          queueId,
          episodeFileId: item.episodeFileId,
          error: message,
          retry: true,
        });
        // Sveglia puntuale allo scadere del backoff (i tick da 60s sarebbero troppo lenti).
        setTimeout(() => {
          void tryStartNext();
        }, wait).unref?.();
      } else {
        updateQueue(queueId, {
          status: 'failed',
          error: message,
          completedAt: new Date().toISOString(),
          speedBps: null,
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
      samples.delete(queueId);
      void tryStartNext();
    }
  }

  async function tryStartNext(): Promise<void> {
    if (stopped || paused) {
      return;
    }
    // Limite dinamico (perk Premium): ri-valutato ad ogni ingresso. Clampato a [1, CONCURRENCY_CAP].
    let limit = MAX_CONCURRENT_DOWNLOADS;
    try {
      limit = Math.max(1, Math.min(CONCURRENCY_CAP, Math.trunc(await resolveMaxConcurrent())));
    } catch (error) {
      logger.debug({ err: error }, 'resolveMaxConcurrent fallito: fallback a 1');
      limit = 1;
    }
    while (activeCount() < limit) {
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
      // Prenotazione riuscita: aggiorna il turno round-robin dell'anime servito.
      serveSeq += 1;
      lastServedAnime.set(next.animeId, serveSeq);
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

  async function reconcileOrphans(): Promise<void> {
    // All'avvio nessun download e' davvero in volo: le righe lasciate 'downloading' o 'processing'
    // da un processo precedente sono orfane. Self-healing: se il file e' gia' al target_path con la
    // dimensione attesa (crash tra il rename atomico e il commit DB), finalizziamo invece di
    // perdere il download; altrimenti marchiamo failed (riavviabile/cancellabile dalla UI).
    const orphans = db
      .select()
      .from(schema.downloadQueue)
      .where(inArray(schema.downloadQueue.status, ['downloading', 'processing']))
      .all();
    if (orphans.length === 0) {
      return;
    }
    const nowIso = new Date().toISOString();
    let healed = 0;
    let failed = 0;
    for (const row of orphans) {
      const size = row.targetPath
        ? await stat(row.targetPath)
            .then((s) => s.size)
            .catch(() => null)
        : null;
      const sizeOk =
        size != null && size > 0 && (row.expectedBytes == null || size === row.expectedBytes);
      if (row.targetPath && sizeOk) {
        const targetPath = row.targetPath;
        db.transaction((tx) => {
          tx.update(schema.episodeFile)
            .set({
              downloadStatus: 'downloaded',
              localPath: targetPath,
              fileSize: size,
              downloadedAt: nowIso,
              updatedAt: nowIso,
            })
            .where(eq(schema.episodeFile.id, row.episodeFileId))
            .run();
          tx.update(schema.downloadQueue)
            .set({
              status: 'completed',
              progress: 1,
              completedAt: nowIso,
              error: null,
              bytesDownloaded: size,
              totalBytes: size,
              speedBps: null,
            })
            .where(eq(schema.downloadQueue.id, row.id))
            .run();
        });
        healed += 1;
        continue;
      }
      db.update(schema.downloadQueue)
        .set({ status: 'failed', error: 'Interrotto da riavvio del server', completedAt: nowIso })
        .where(eq(schema.downloadQueue.id, row.id))
        .run();
      failed += 1;
    }
    if (healed > 0) {
      logger.info(
        { healed },
        "Download orfani finalizzati all'avvio (file gia' presente al target)",
      );
    }
    if (failed > 0) {
      logger.warn({ count: failed }, 'Download orfani interrotti da riavvio segnati come failed');
    }
  }

  const worker: DownloadWorker = {
    start(): void {
      if (!stopped) {
        return;
      }
      stopped = false;
      paused = false;
      // Reconcile (con self-healing) PRIMA dello sweep: cosi' lo sweep calcola i job riavviabili
      // sugli stati definitivi e fa partire i job solo dopo aver ripulito i .part orfani.
      void (async () => {
        await reconcileOrphans();
        // Conserva i .part dei job riavviabili (queued/failed) per riprenderli; rimuove gli orfani.
        const restartable = new Set(
          db
            .select({ id: schema.downloadQueue.id })
            .from(schema.downloadQueue)
            .where(inArray(schema.downloadQueue.status, ['queued', 'failed']))
            .all()
            .map((r) => r.id),
        );
        try {
          const counts = await Promise.all(
            config.distinctDownloadRoots().map((root) => sweepPartFiles(root, logger, restartable)),
          );
          const n = counts.reduce((sum, c) => sum + c, 0);
          if (n > 0) {
            logger.info({ removed: n }, "File .part orfani rimossi all'avvio");
          }
        } catch (error) {
          logger.error({ err: error }, "Sweep dei .part orfani all'avvio fallito");
        }
        if (!stopped) {
          void tryStartNext();
        }
      })();
      timer = setInterval(safetyTick, SAFETY_TICK_MS);
      timer.unref?.();
      logger.info({ everyMs: SAFETY_TICK_MS }, 'Download worker avviato');
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
        // Se la riga è in uno stato terminale, riattivala invece di restituirla inerte: altrimenti
        // ri-scaricare un episodio cancellato/fallito/completato tornerebbe il vecchio queueId senza
        // accodare nulla (bug A2). Un job ancora attivo (queued/downloading/processing) resta com'è.
        const terminal =
          existing.status === 'cancelled' ||
          existing.status === 'failed' ||
          existing.status === 'completed';
        if (terminal) {
          updateQueue(existing.id, {
            status: 'queued',
            progress: 0,
            bytesDownloaded: 0,
            totalBytes: null,
            speedBps: null,
            error: null,
            retryCount: 0,
            retryAt: null,
            startedAt: null,
            completedAt: null,
            // Ripartenza pulita: scarta lo stato di resume del tentativo precedente (l'eventuale
            // .part verrà rimosso da runOne perché sourceUrl non coinciderà).
            targetPath: null,
            expectedBytes: null,
            sourceUrl: null,
          });
          if (priority != null) {
            updateQueue(existing.id, { priority });
          }
          emitter.emit('enqueue', { queueId: existing.id, episodeFileId });
          void tryStartNext();
        }
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
      updateQueue(queueId, {
        status: 'queued',
        retryCount: 0,
        error: null,
        progress: 0,
        bytesDownloaded: 0,
        speedBps: null,
        // Retry manuale: riparte subito, nessun gate di backoff residuo.
        retryAt: null,
      });
      emitter.emit('enqueue', { queueId, episodeFileId: item.episodeFileId });
      void tryStartNext();
      return true;
    },

    setPriority(queueId, priority) {
      const clamped = Math.max(0, Math.min(100, Math.round(priority)));
      const result = db
        .update(schema.downloadQueue)
        .set({ priority: clamped })
        .where(eq(schema.downloadQueue.id, queueId))
        .run();
      if (result.changes === 0) {
        return false;
      }
      void tryStartNext();
      return true;
    },
  };

  return worker;
}
