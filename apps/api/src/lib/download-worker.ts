import { EventEmitter } from 'node:events';
import { rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Language } from '@animeunion/shared';
import { and, asc, desc, eq, inArray, isNull, lte, max, min, or } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import type { CatalogService } from '../services/catalog-service';
import type { ConfigService } from '../services/config-service';
import type { FileMutationCoordinator } from '../services/file-mutation-coordinator';
import type { RenamerService } from '../services/renamer-service';
import { atomicMove, ensureDir, freeDiskBytes, sweepPartFiles, tempPath } from './download-fs';
import {
  DownloadAbortedError,
  type DownloadProgress,
  EnvironmentDownloadError,
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
  start(): Promise<void>;
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
  /**
   * Cancella un job. La decisione è serializzata con la finalizzazione filesystem: `true` implica
   * che nessun file finale verrà pubblicato; se finalize ha già acquisito il coordinatore ritorna
   * `false` dopo il relativo commit.
   */
  cancel(queueId: string): Promise<boolean>;
  /** Riavvia un job in failed (azzera retry_count). */
  retry(queueId: string): boolean;
  /**
   * Rimette in coda tutti i job falliti per causa ambientale (`fail_kind='env'`: cartella non
   * scrivibile / I-O / spazio). Chiamato quando il Doctor rileva il ripristino. Ritorna quanti
   * ne ha ripresi. I fallimenti 'permanent'/'other' restano fermi.
   */
  retryEnvFailed(): number;
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

/** Causa di un fallimento terminale, persistita in download_queue.fail_kind (vedi migr. 0020). */
type FailKind = 'env' | 'permanent' | 'other';

// Codici errno di errori "ambientali" (cartella/volume): recuperabili quando l'ambiente guarisce.
// EACCES/EPERM: permessi; EROFS: filesystem read-only; ENOSPC: disco pieno; EIO/ENXIO: I-O device.
const ENV_ERRNO = new Set(['EACCES', 'EPERM', 'EROFS', 'ENOSPC', 'EIO', 'ENXIO']);

/**
 * Classifica l'errore di un download per decidere la ripresa automatica: 'permanent' non riparte
 * mai, 'env' riparte quando il Doctor rileva il ripristino della cartella/disco, 'other' (transitorio
 * esaurito i retry) resta fermo ma e' ri-tentabile a mano.
 */
function classifyError(error: unknown): FailKind {
  if (error instanceof PermanentDownloadError) {
    return 'permanent';
  }
  if (error instanceof EnvironmentDownloadError) {
    return 'env';
  }
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code && ENV_ERRNO.has(code)) {
    return 'env';
  }
  return 'other';
}

export interface DownloadWorkerDeps {
  db: Db;
  catalog: CatalogService;
  config: ConfigService;
  logger: Logger;
  renamer: RenamerService;
  coordinator: FileMutationCoordinator;
  /**
   * Limite corrente di download simultanei, ri-valutato ad ogni decisione di scheduling. Assente =
   * fallback a 1 (compat). `context.ts` lo cabla su `isPremiumActive` + `config.maxConcurrent`.
   */
  resolveMaxConcurrent?: () => number | Promise<number>;
  /** Seam deterministico per la verifica del `.part` nei test di cancellazione. */
  verifyVideoFileImpl?: typeof verifyVideoFile;
  /** Seam deterministico per linearizzare i test durante la pubblicazione finale. */
  atomicMoveImpl?: typeof atomicMove;
}

export function createDownloadWorker(deps: DownloadWorkerDeps): DownloadWorker {
  const { db, catalog, config, logger, renamer, coordinator } = deps;
  const resolveMaxConcurrent =
    deps.resolveMaxConcurrent ?? ((): number => MAX_CONCURRENT_DOWNLOADS);
  const verifyDownloadedFile = deps.verifyVideoFileImpl ?? verifyVideoFile;
  const publishDownload = deps.atomicMoveImpl ?? atomicMove;
  const emitter = new EventEmitter();
  const inFlight = new Map<string, InFlight>();
  // Campionamento per stima velocità (in memoria, non persistito).
  const samples = new Map<
    string,
    { lastBytes: number; lastTs: number; lastWriteTs: number; speed: number }
  >();

  let timer: NodeJS.Timeout | null = null;
  let startup: Promise<void> | null = null;
  let startupGeneration = 0;
  let stopped = true;
  let ready = false;
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
        throw new EnvironmentDownloadError(
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
        const verify = await verifyDownloadedFile(partial, { logger });
        if (!verify.ok) {
          await rm(partial).catch(() => {});
          throw new Error(
            `Verifica integrità fallita: ${verify.reason ?? 'file non riproducibile'}`,
          );
        }
      }

      // CAS post-verifica: ffmpeg può restare sospeso mentre cancel() porta la riga a cancelled.
      // Solo il tentativo che possiede ancora `downloading` può entrare in finalizzazione.
      const claimedForProcessing = db
        .update(schema.downloadQueue)
        .set({ status: 'processing', progress: 1, speedBps: null })
        .where(
          and(eq(schema.downloadQueue.id, queueId), eq(schema.downloadQueue.status, 'downloading')),
        )
        .run();
      if (claimedForProcessing.changes === 0) {
        await rm(partial, { force: true }).catch(() => {});
        const current = db
          .select({ status: schema.downloadQueue.status })
          .from(schema.downloadQueue)
          .where(eq(schema.downloadQueue.id, queueId))
          .get();
        if (current?.status === 'cancelled') {
          emitter.emit('cancelled', { queueId, episodeFileId: item.episodeFileId });
        }
        return;
      }
      const finalized = await coordinator.runExclusive(async () => {
        const currentQueue = db
          .select({ status: schema.downloadQueue.status })
          .from(schema.downloadQueue)
          .where(eq(schema.downloadQueue.id, queueId))
          .get();
        const currentFile = db
          .select({ status: schema.episodeFile.downloadStatus })
          .from(schema.episodeFile)
          .where(eq(schema.episodeFile.id, item.episodeFileId))
          .get();
        // Una cancellazione può aver rimosso la coda mentre rete/verifica erano fuori lock; allo
        // stesso modo un link external o un altro reconciler può aver reso autorevole il file.
        // In entrambi i casi la finalizzazione è superata e non deve resuscitare/sovrascrivere dati.
        if (currentQueue?.status !== 'processing' || currentFile?.status !== 'not_downloaded') {
          await rm(partial, { force: true }).catch(() => {});
          if (currentQueue?.status === 'processing') {
            db.update(schema.downloadQueue)
              .set({
                status: 'cancelled',
                error: 'Finalizzazione annullata da una mutation filesystem concorrente',
                completedAt: new Date().toISOString(),
                speedBps: null,
              })
              .where(eq(schema.downloadQueue.id, queueId))
              .run();
          }
          return false;
        }

        // Finalize e cancel condividono il coordinatore: una volta entrati qui il move e il commit
        // sono un'unica operazione logica. Un cancel accodato dopo questo punto osserverà completed
        // e ritornerà false; uno accodato prima avrà già reso fallita la precondizione sopra.
        await publishDownload(partial, finalPath, logger);

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
        return true;
      });

      if (!finalized) {
        emitter.emit('cancelled', { queueId, episodeFileId: item.episodeFileId });
        return;
      }
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
          // Un tentativo che riparte non e' in stato di fallimento: azzera la causa.
          failKind: null,
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
          // Causa persistita: i 'env' (cartella/disco) ripartono quando il Doctor rileva il
          // ripristino; 'permanent'/'other' restano fermi (ri-tentabili a mano).
          failKind: classifyError(error),
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
    // `ready` è il gate comune a timer, enqueue, resume e chiamate dirette: nessun percorso può
    // prelevare job mentre reconcile e sweep stanno ancora costruendo lo snapshot di startup.
    if (stopped || !ready || paused) {
      return;
    }
    const schedulingGeneration = startupGeneration;
    // Limite dinamico (perk Premium): ri-valutato ad ogni ingresso. Clampato a [1, CONCURRENCY_CAP].
    let limit = MAX_CONCURRENT_DOWNLOADS;
    try {
      limit = Math.max(1, Math.min(CONCURRENCY_CAP, Math.trunc(await resolveMaxConcurrent())));
    } catch (error) {
      logger.debug({ err: error }, 'resolveMaxConcurrent fallito: fallback a 1');
      limit = 1;
    }
    // Il resolver può sospendersi attraverso stop() e un nuovo start(): in quel caso questa
    // invocazione appartiene allo startup precedente e non deve prenotare job durante il reconcile.
    if (stopped || !ready || paused || schedulingGeneration !== startupGeneration) {
      return;
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
    // da un processo precedente sono orfane. La select esterna serve solo a enumerare candidati:
    // ogni decisione viene ripetuta sotto il coordinatore sullo stato autorevole corrente.
    const candidates = db
      .select({ id: schema.downloadQueue.id })
      .from(schema.downloadQueue)
      .where(inArray(schema.downloadQueue.status, ['downloading', 'processing']))
      .all();
    if (candidates.length === 0) {
      return;
    }
    const nowIso = new Date().toISOString();
    let healed = 0;
    let failed = 0;
    for (const candidate of candidates) {
      const rowHealed = await coordinator.runExclusive(async (): Promise<boolean | null> => {
        const currentQueue = db
          .select()
          .from(schema.downloadQueue)
          .where(eq(schema.downloadQueue.id, candidate.id))
          .get();
        if (
          !currentQueue ||
          (currentQueue.status !== 'downloading' && currentQueue.status !== 'processing')
        ) {
          return null;
        }
        const currentFile = db
          .select({ status: schema.episodeFile.downloadStatus })
          .from(schema.episodeFile)
          .where(eq(schema.episodeFile.id, currentQueue.episodeFileId))
          .get();
        // Una mutation passata prima del lock può aver cancellato la queue o reso autorevole il
        // file (downloaded/external). Preserviamo il file ma terminalizziamo l'orfano: lasciarlo
        // processing/downloading occuperebbe per sempre uno slot di concorrenza dopo la readiness.
        if (!currentFile) {
          db.update(schema.downloadQueue)
            .set({
              status: 'failed',
              error: 'Episode file non più presente durante il reconcile',
              completedAt: nowIso,
              speedBps: null,
            })
            .where(
              and(
                eq(schema.downloadQueue.id, currentQueue.id),
                inArray(schema.downloadQueue.status, ['downloading', 'processing']),
              ),
            )
            .run();
          return false;
        }
        if (currentFile.status !== 'not_downloaded') {
          db.update(schema.downloadQueue)
            .set({
              status: 'cancelled',
              error: `Reconcile superato dallo stato autorevole ${currentFile.status}`,
              completedAt: nowIso,
              speedBps: null,
            })
            .where(
              and(
                eq(schema.downloadQueue.id, currentQueue.id),
                inArray(schema.downloadQueue.status, ['downloading', 'processing']),
              ),
            )
            .run();
          return null;
        }

        const size = currentQueue.targetPath
          ? await stat(currentQueue.targetPath)
              .then((s) => s.size)
              .catch(() => null)
          : null;
        const sizeOk =
          size != null &&
          size > 0 &&
          (currentQueue.expectedBytes == null || size === currentQueue.expectedBytes);
        if (currentQueue.targetPath && sizeOk) {
          const targetPath = currentQueue.targetPath;
          db.transaction((tx) => {
            tx.update(schema.episodeFile)
              .set({
                downloadStatus: 'downloaded',
                localPath: targetPath,
                fileSize: size,
                downloadedAt: nowIso,
                updatedAt: nowIso,
              })
              .where(
                and(
                  eq(schema.episodeFile.id, currentQueue.episodeFileId),
                  eq(schema.episodeFile.downloadStatus, 'not_downloaded'),
                ),
              )
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
              .where(
                and(
                  eq(schema.downloadQueue.id, currentQueue.id),
                  inArray(schema.downloadQueue.status, ['downloading', 'processing']),
                ),
              )
              .run();
          });
          return true;
        }
        db.update(schema.downloadQueue)
          .set({ status: 'failed', error: 'Interrotto da riavvio del server', completedAt: nowIso })
          .where(
            and(
              eq(schema.downloadQueue.id, currentQueue.id),
              inArray(schema.downloadQueue.status, ['downloading', 'processing']),
            ),
          )
          .run();
        return false;
      });
      if (rowHealed === null) {
        continue;
      }
      if (rowHealed) {
        healed += 1;
      } else {
        failed += 1;
      }
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
    start(): Promise<void> {
      if (!stopped) {
        return startup ?? Promise.resolve();
      }
      stopped = false;
      ready = false;
      paused = false;
      const generation = ++startupGeneration;
      // La Promise espone una readiness deterministica: reconcile e sweep terminano prima che il
      // worker armi il safety timer o consenta a qualunque percorso di prelevare nuovi job.
      startup = (async () => {
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
        if (stopped || generation !== startupGeneration) {
          return;
        }
        ready = true;
        timer = setInterval(safetyTick, SAFETY_TICK_MS);
        timer.unref?.();
        logger.info({ everyMs: SAFETY_TICK_MS }, 'Download worker avviato');
        void tryStartNext();
      })();
      // Anche i caller lifecycle che non attendono start() non generano rejection non gestite.
      void startup.catch((error) => {
        ready = false;
        logger.error({ err: error }, 'Inizializzazione download worker fallita');
      });
      return startup;
    },

    stop(): void {
      stopped = true;
      ready = false;
      startupGeneration += 1;
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
            failKind: null,
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

    async cancel(queueId) {
      return coordinator.runExclusive(async () => {
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
          // Questo tratto usa lo stesso lock di finalize. Se cancel entra prima, il CAS
          // post-verifica o la precondizione di finalize vedranno cancelled; se finalize è già nel
          // lock, cancel attende il commit completed e ritorna false alla rilettura qui sopra.
          updateQueue(queueId, {
            status: 'cancelled',
            completedAt: new Date().toISOString(),
            speedBps: null,
          });
          const inflight = inFlight.get(queueId);
          if (inflight) {
            inflight.controller.abort();
          } else {
            // Orfano: il processo che lo scaricava non c'e' piu' (es. dopo un riavvio).
            emitter.emit('cancelled', { queueId, episodeFileId: item.episodeFileId });
          }
          return true;
        }
        return false;
      });
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
        failKind: null,
        // Retry manuale: riparte subito, nessun gate di backoff residuo.
        retryAt: null,
      });
      emitter.emit('enqueue', { queueId, episodeFileId: item.episodeFileId });
      void tryStartNext();
      return true;
    },

    retryEnvFailed() {
      const rows = db
        .select({ id: schema.downloadQueue.id, episodeFileId: schema.downloadQueue.episodeFileId })
        .from(schema.downloadQueue)
        .where(
          and(eq(schema.downloadQueue.status, 'failed'), eq(schema.downloadQueue.failKind, 'env')),
        )
        .all();
      if (rows.length === 0) {
        return 0;
      }
      for (const row of rows) {
        updateQueue(row.id, {
          status: 'queued',
          retryCount: 0,
          error: null,
          progress: 0,
          bytesDownloaded: 0,
          speedBps: null,
          failKind: null,
          // Ripristino ambientale: riparte subito (nessun backoff residuo). startedAt/completedAt
          // restano invariati: verranno sovrascritti quando il job riparte davvero.
          retryAt: null,
        });
        emitter.emit('enqueue', { queueId: row.id, episodeFileId: row.episodeFileId });
      }
      void tryStartNext();
      return rows.length;
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
