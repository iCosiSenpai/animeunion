import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import type {
  DownloadAddByRefInput,
  DownloadCounts,
  DownloadFilter,
  DownloadGroupItemsInput,
  DownloadGroupSummary,
  DownloadQueuePage,
  DownloadQueueSummary,
  Language,
} from '@animeunion/shared';
import { and, asc, count, desc, eq, inArray, lt } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import type { DownloadWorker } from '../lib/download-worker';
import { NotFoundError, PreconditionError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import type { CatalogService } from './catalog-service';
import type { ConfigService } from './config-service';
import type { RenamerService } from './renamer-service';

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
  /** Come addMissing ma identifica l'anime via slug (mette prima gli episodi in cache). */
  addAllBySlug(input: { slug: string; language?: Language }): Promise<number>;
  /** Lista la coda joinata con episode/anime per la UI. */
  getQueue(): DownloadQueueItem[];
  /**
   * Riassunto della coda per la UI a coda gigante: un gruppo per anime con conteggi per stato e
   * solo gli item attivi (downloading/processing) per la barra/ETA live, più i conteggi globali per
   * i badge filtro. Payload O(#anime + #attivi) invece di O(#coda).
   */
  getQueueSummary(): DownloadQueueSummary;
  /** Pagina di righe coda per un singolo anime (espansione card on-demand). */
  getQueueGroupItems(input: DownloadGroupItemsInput): DownloadQueuePage;
  /** Cancella un job (queued: immediato; downloading: abort). */
  cancel(queueId: string): boolean;
  /** Annulla tutti i job in coda. */
  cancelAll(): number;
  /** Annulla tutti i job non terminali di un singolo anime (azione di gruppo, una chiamata). */
  cancelGroup(animeId: string): number;
  /** Rimette in coda un job in failed. */
  retry(queueId: string): boolean;
  /** Rimette in coda tutti i job falliti. */
  retryAllFailed(): number;
  /** Rimette in coda tutti i job falliti di un singolo anime (azione di gruppo, una chiamata). */
  retryGroup(animeId: string): number;
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
  /**
   * Accoda nuovi episodi per i follow con auto-download attivo (chiamato dallo scheduler).
   * Effettivo = follow.autoDownload, oppure (se null) status==='watching'. Richiede il master
   * config.autoDownload. Status-aware: i COMPLETED sono esclusi (niente nuovi episodi); per gli
   * ONGOING rinfresca prima il catalogo (forceRefresh) per rilevare i nuovi episodi.
   */
  enqueueForAutoFollows(): Promise<number>;
}

export interface DownloadServiceDeps {
  db: Db;
  worker: DownloadWorker;
  catalog: CatalogService;
  config: ConfigService;
  renamer: RenamerService;
  logger: Logger;
  now?: () => Date;
  /** Callback opzionale: nuovi episodi accodati automaticamente per un anime (per notifiche). */
  onAutoEnqueued?: (animeId: string, count: number) => void;
}

const RETRY_MAX = 3;

const NOT_CONFIGURED_MSG =
  'Configura le cartelle di download nelle Impostazioni prima di scaricare.';

const ACTIVE_STATUSES = ['queued', 'downloading', 'processing'] as const;
const INFLIGHT_STATUSES = ['downloading', 'processing'] as const;

// Cooldown prima che l'auto-download ritenti un episodio fallito. Senza, gli errori permanenti
// (link scaduto/404/contenuto non video) verrebbero ri-tentati a ogni ciclo (~30 min) generando
// rumore (notifiche "Nuovi episodi") senza mai riuscire. Il retry manuale resta immediato.
const AUTO_RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 ore

function isTerminal(status: string): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'failed';
}

// Colonne denormalizzate (anime + episode) condivise da getQueue, getQueueGroupItems e dagli attivi
// del riassunto: un'unica fonte per il mapping riga -> DownloadQueueItem.
const queueSelectColumns = {
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
} as const;

interface QueueRow {
  id: string;
  episodeFileId: string;
  status: string;
  progress: number | null;
  bytesDownloaded: number | null;
  totalBytes: number | null;
  speedBps: number | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  retryCount: number | null;
  retryMax: number | null;
  priority: number | null;
  createdAt: string;
  episodeId: string;
  language: string;
  episodeNumber: number;
  episodeTitle: string | null;
  animeId: string;
  animeTitle: string;
  animeSlug: string;
  animeCoverImage: string | null;
}

function mapRow(r: QueueRow): DownloadQueueItem {
  return {
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
  };
}

// Traduce il filtro UI in lista di status DB.
function statusesForFilter(filter: DownloadFilter): readonly string[] | null {
  if (filter === 'active') return ACTIVE_STATUSES;
  if (filter === 'completed') return ['completed'];
  if (filter === 'failed') return ['failed', 'cancelled'];
  return null;
}

const VIDEO_EXT = new Set(['.mp4', '.mkv']);

// Trova un file video gia' presente nella cartella di destinazione che rappresenta lo STESSO
// episodio del path canonico, anche se il nome non coincide. Serve a non ri-scaricare (→ duplicare)
// una libreria pre-esistente importata con naming diverso da quello dell'app: `S01E05.mp4`,
// `01.mp4`, `E01.mp4`, `Nome Ep. 5.mp4`. Ritorna il path del file trovato o null. Il match canonico
// esatto ha priorita'; per i film (path senza SxxExx) NON si fa match loose (evita falsi positivi).
export function findExistingEpisodeFile(canonicalPath: string): string | null {
  if (existsSync(canonicalPath)) {
    return canonicalPath;
  }
  const canonBase = basename(canonicalPath);
  const se = canonBase.match(/S(\d{1,3})E(\d{1,4})/i);
  if (!se) {
    return null;
  }
  const season = Number(se[1]);
  const ep = Number(se[2]);
  // Se il canonico ha un tag lingua (SUB e DUB condividono la root, renamer righe ~162-164) un file
  // legacy senza tag e' ambiguo: si accettano solo candidati con lo STESSO tag, mai i nomi "grezzi".
  const requiredTag = canonBase.match(/ - (?:SUB|DUB) ITA/i)?.[0]?.toUpperCase() ?? null;
  const dir = dirname(canonicalPath);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const name of entries) {
    if (!VIDEO_EXT.has(extname(name).toLowerCase())) {
      continue;
    }
    if (requiredTag && !name.toUpperCase().includes(requiredTag)) {
      continue;
    }
    const cand = name.match(/S(\d{1,3})E(\d{1,4})/i);
    if (cand) {
      if (Number(cand[1]) === season && Number(cand[2]) === ep) {
        return join(dir, name);
      }
      continue;
    }
    // Con tag richiesto non ci si fida dei nomi legacy senza SxxExx (ambigui sulla lingua).
    if (requiredTag) {
      continue;
    }
    // Naming legacy senza SxxExx: numero episodio grezzo. La stagione e' implicita nella cartella.
    const alt =
      name.match(/(?:^|[^A-Za-z0-9])(?:E|Ep\.?)\s*(\d{1,3})(?:\D|$)/i) ??
      name.match(/^(\d{1,3})\.[^.]+$/);
    if (alt && Number(alt[1]) === ep) {
      return join(dir, name);
    }
  }
  return null;
}

export function createDownloadService(deps: DownloadServiceDeps): DownloadService {
  const { db, worker, catalog, config, renamer, logger } = deps;
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

  function presentOnDisk(localPath: string | null): boolean {
    return !!localPath && existsSync(localPath);
  }

  // La root configurata che contiene il file e' raggiungibile? Se il NAS/mount e' staccato NON si
  // resetta: eviteremmo di azzerare l'intera libreria solo perche' il disco e' temporaneamente giu'.
  function rootPresent(localPath: string | null): boolean {
    if (!localPath) {
      return false;
    }
    const lp = resolve(localPath);
    return config.distinctDownloadRoots().some((r) => {
      if (!r) {
        return false;
      }
      const rr = resolve(r);
      return (lp === rr || lp.startsWith(rr + sep)) && existsSync(rr);
    });
  }

  // Self-healing: un episode_file marcato downloaded/external ma non piu' presente su disco
  // (cancellato fuori app) viene azzerato — e l'eventuale riga di coda terminale rimossa — cosi' puo'
  // essere riaccodato invece di restare "gia' scaricato" per sempre. Solo se la root e' raggiungibile.
  // Ritorna true se ha liberato il file.
  function healMissing(file: { id: string; status: string; localPath: string | null }): boolean {
    if (file.status !== 'downloaded' && file.status !== 'external') {
      return false;
    }
    if (presentOnDisk(file.localPath) || !rootPresent(file.localPath)) {
      return false;
    }
    const ts = now().toISOString();
    db.update(schema.episodeFile)
      .set({ downloadStatus: 'not_downloaded', localPath: null, updatedAt: ts })
      .where(eq(schema.episodeFile.id, file.id))
      .run();
    db.delete(schema.downloadQueue)
      .where(
        and(
          eq(schema.downloadQueue.episodeFileId, file.id),
          inArray(schema.downloadQueue.status, ['completed', 'cancelled', 'failed']),
        ),
      )
      .run();
    logger.info({ episodeFileId: file.id }, 'Self-healing: file mancante su disco, stato azzerato');
    return true;
  }

  // Self-healing "in ingresso": un episode_file `not_downloaded` il cui file esiste GIA' su disco al
  // path atteso (renamer) viene marcato downloaded invece di essere ri-scaricato. Evita di ri-scaricare
  // e sovrascrivere una libreria gia' presente quando il DB ne ha perso traccia (es. dopo un restore
  // o una desync disco/DB). Ritorna true se ha riconciliato il file (→ niente enqueue).
  function healPresent(
    file: { id: string; language: string; number: number },
    animeId: string,
  ): boolean {
    let canonicalPath: string;
    try {
      canonicalPath = renamer.computeEpisodePath({
        animeId,
        episodeNumber: file.number,
        language: file.language as Language,
      });
    } catch (error) {
      logger.debug({ err: error, episodeFileId: file.id }, 'healPresent: calcolo path fallito');
      return false;
    }
    // Cerca l'episodio su disco per (stagione, numero) — non solo al nome canonico — cosi' una
    // libreria pre-esistente con naming legacy viene riconosciuta invece che ri-scaricata (duplicata).
    const path = findExistingEpisodeFile(canonicalPath);
    if (!path) {
      return false;
    }
    let size = 0;
    try {
      size = statSync(path).size;
    } catch {
      size = 0;
    }
    const ts = now().toISOString();
    db.update(schema.episodeFile)
      .set({
        downloadStatus: 'downloaded',
        localPath: path,
        fileSize: size,
        downloadedAt: ts,
        updatedAt: ts,
      })
      .where(eq(schema.episodeFile.id, file.id))
      .run();
    logger.info(
      { episodeFileId: file.id, path },
      'Self-healing: file gia presente su disco, marcato downloaded (nessun ri-download)',
    );
    return true;
  }

  // Accoda gli episodi mancanti di un anime. `auto` = chiamata dallo scheduler: applica il cooldown
  // sui falliti per non ritentare gli errori permanenti a ogni ciclo. Conta solo ciò che accoda o
  // ritenta davvero (un fallito ritentato via worker.retry, un nuovo via worker.enqueue), così il
  // contatore — e la notifica "Nuovi episodi" che ne dipende — non viene gonfiato da no-op.
  function addMissingImpl(
    animeId: string,
    language: Language | undefined,
    auto: boolean,
    minEpisodeNumber?: number,
  ): number {
    if (!config.isConfigured()) {
      throw new PreconditionError(NOT_CONFIGURED_MSG);
    }
    const files = db
      .select({
        id: schema.episodeFile.id,
        language: schema.episodeFile.language,
        status: schema.episodeFile.downloadStatus,
        localPath: schema.episodeFile.localPath,
        number: schema.episode.number,
      })
      .from(schema.episodeFile)
      .innerJoin(schema.episode, eq(schema.episodeFile.episodeId, schema.episode.id))
      .where(eq(schema.episode.animeId, animeId))
      .all()
      .filter((f) => (language ? f.language === language : true));
    const nowMs = now().getTime();

    // Filtra prima i file candidati (forward-only + self-healing + external).
    const candidates = files.filter((file) => {
      if (minEpisodeNumber != null && file.number <= minEpisodeNumber) return false;
      const healed = healMissing(file);
      if (!healed && (file.status === 'downloaded' || file.status === 'external')) return false;
      // Se il DB dice not_downloaded ma il file esiste gia' al path atteso, riconcilialo e non
      // ri-scaricarlo (idempotenza rispetto al disco).
      if (file.status === 'not_downloaded' && healPresent(file, animeId)) return false;
      return true;
    });

    // Una sola query per recuperare tutti i job esistenti in coda per i file candidati,
    // invece di N query .get() separate. Map per lookup O(1) nel loop seguente.
    const queueRows =
      candidates.length > 0
        ? db
            .select({
              episodeFileId: schema.downloadQueue.episodeFileId,
              id: schema.downloadQueue.id,
              status: schema.downloadQueue.status,
              completedAt: schema.downloadQueue.completedAt,
            })
            .from(schema.downloadQueue)
            .where(
              inArray(
                schema.downloadQueue.episodeFileId,
                candidates.map((f) => f.id),
              ),
            )
            .all()
        : [];
    const queueByFileId = new Map(queueRows.map((r) => [r.episodeFileId, r]));

    let count = 0;
    for (const file of candidates) {
      const existing = queueByFileId.get(file.id);
      if (!existing) {
        worker.enqueue(file.id);
        count += 1;
        continue;
      }
      if (!isTerminal(existing.status)) {
        continue; // gia' in coda o in corso
      }
      if (existing.status === 'failed') {
        // Auto: salta i falliti ancora nel cooldown (niente ri-accodo/notifica su errori permanenti).
        if (
          auto &&
          existing.completedAt &&
          nowMs - Date.parse(existing.completedAt) < AUTO_RETRY_COOLDOWN_MS
        ) {
          continue;
        }
        // Retry reale: worker.enqueue è un no-op sulle righe esistenti, worker.retry resetta a queued.
        if (worker.retry(existing.id)) {
          count += 1;
        }
        // Restano `completed` (di fatto già scaricato, escluso sopra) e `cancelled` (annullato
        // dall'utente): non si ri-accodano automaticamente né manualmente da qui.
      }
    }
    return count;
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
      // Self-healing: se e' marcato scaricato/esterno ma il file e' sparito dal disco, azzera lo
      // stato (e rimuove la riga di coda terminale) cosi' worker.enqueue ne crea una nuova.
      const file = db
        .select({
          id: schema.episodeFile.id,
          status: schema.episodeFile.downloadStatus,
          localPath: schema.episodeFile.localPath,
        })
        .from(schema.episodeFile)
        .where(eq(schema.episodeFile.id, episodeFileId))
        .get();
      if (file) {
        healMissing(file);
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
      return addMissingImpl(animeId, language, false);
    },

    addAll({ animeId, language }) {
      return addMissingImpl(animeId, language, false);
    },

    async addAllBySlug({ slug, language }) {
      if (!config.isConfigured()) {
        throw new PreconditionError(NOT_CONFIGURED_MSG);
      }
      // Garantisce anime + episodi in cache, poi accoda i mancanti dell'entry.
      const detail = await catalog.getBySlug(slug);
      return addMissingImpl(detail.id, language, false);
    },

    getQueue() {
      const rows = db
        .select(queueSelectColumns)
        .from(schema.downloadQueue)
        .innerJoin(
          schema.episodeFile,
          eq(schema.episodeFile.id, schema.downloadQueue.episodeFileId),
        )
        .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
        .innerJoin(schema.anime, eq(schema.anime.id, schema.episode.animeId))
        .orderBy(desc(schema.downloadQueue.priority), desc(schema.downloadQueue.createdAt))
        .all();
      return rows.map(mapRow);
    },

    getQueueSummary() {
      // Query A: conteggi (anime x stato), nessuna riga della coda spedita.
      const countRows = db
        .select({
          animeId: schema.anime.id,
          animeTitle: schema.anime.title,
          animeSlug: schema.anime.slug,
          animeCoverImage: schema.anime.coverImage,
          status: schema.downloadQueue.status,
          n: count(),
        })
        .from(schema.downloadQueue)
        .innerJoin(
          schema.episodeFile,
          eq(schema.episodeFile.id, schema.downloadQueue.episodeFileId),
        )
        .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
        .innerJoin(schema.anime, eq(schema.anime.id, schema.episode.animeId))
        .groupBy(schema.anime.id, schema.downloadQueue.status)
        .all();

      const counts: DownloadCounts = {
        all: 0,
        queued: 0,
        downloading: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      };
      const groups = new Map<string, DownloadGroupSummary>();
      for (const row of countRows) {
        let group = groups.get(row.animeId);
        if (!group) {
          group = {
            animeId: row.animeId,
            animeTitle: row.animeTitle,
            animeSlug: row.animeSlug,
            animeCoverImage: row.animeCoverImage,
            total: 0,
            queued: 0,
            downloading: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
            activeItems: [],
          };
          groups.set(row.animeId, group);
        }
        group.total += row.n;
        counts.all += row.n;
        if (row.status in counts) {
          counts[row.status as keyof DownloadCounts] += row.n;
          group[row.status as 'queued'] += row.n;
        }
      }

      // Query B: solo gli item in volo (downloading/processing), per barra/velocità/ETA live.
      const activeRows = db
        .select(queueSelectColumns)
        .from(schema.downloadQueue)
        .innerJoin(
          schema.episodeFile,
          eq(schema.episodeFile.id, schema.downloadQueue.episodeFileId),
        )
        .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
        .innerJoin(schema.anime, eq(schema.anime.id, schema.episode.animeId))
        .where(inArray(schema.downloadQueue.status, [...INFLIGHT_STATUSES]))
        .orderBy(desc(schema.downloadQueue.priority), desc(schema.downloadQueue.createdAt))
        .all();
      for (const r of activeRows) {
        groups.get(r.animeId)?.activeItems.push(mapRow(r));
      }

      // Gruppi con download in corso in cima, poi per titolo (come l'attuale groupQueue lato UI).
      const ordered = [...groups.values()].sort((a, b) => {
        const aActive = a.downloading > 0 ? 0 : 1;
        const bActive = b.downloading > 0 ? 0 : 1;
        return aActive - bActive || a.animeTitle.localeCompare(b.animeTitle, 'it');
      });
      return { groups: ordered, counts };
    },

    getQueueGroupItems({ animeId, filter, limit, offset }) {
      const statuses = statusesForFilter(filter);
      const where = statuses
        ? and(eq(schema.anime.id, animeId), inArray(schema.downloadQueue.status, [...statuses]))
        : eq(schema.anime.id, animeId);
      const rows = db
        .select(queueSelectColumns)
        .from(schema.downloadQueue)
        .innerJoin(
          schema.episodeFile,
          eq(schema.episodeFile.id, schema.downloadQueue.episodeFileId),
        )
        .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
        .innerJoin(schema.anime, eq(schema.anime.id, schema.episode.animeId))
        .where(where)
        .orderBy(asc(schema.episode.number), asc(schema.downloadQueue.createdAt))
        .limit(limit)
        .offset(offset)
        .all();
      const totalRow = db
        .select({ n: count() })
        .from(schema.downloadQueue)
        .innerJoin(
          schema.episodeFile,
          eq(schema.episodeFile.id, schema.downloadQueue.episodeFileId),
        )
        .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
        .innerJoin(schema.anime, eq(schema.anime.id, schema.episode.animeId))
        .where(where)
        .get();
      return { items: rows.map(mapRow), total: totalRow?.n ?? 0 };
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

    cancelGroup(animeId) {
      const rows = db
        .select({ id: schema.downloadQueue.id })
        .from(schema.downloadQueue)
        .innerJoin(
          schema.episodeFile,
          eq(schema.episodeFile.id, schema.downloadQueue.episodeFileId),
        )
        .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
        .where(
          and(
            eq(schema.episode.animeId, animeId),
            inArray(schema.downloadQueue.status, [...ACTIVE_STATUSES]),
          ),
        )
        .all();
      let count = 0;
      for (const row of rows) {
        if (worker.cancel(row.id)) {
          count += 1;
        }
      }
      if (count > 0) {
        logger.info({ count, animeId }, 'Download del gruppo annullati');
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

    retryGroup(animeId) {
      const rows = db
        .select({ id: schema.downloadQueue.id })
        .from(schema.downloadQueue)
        .innerJoin(
          schema.episodeFile,
          eq(schema.episodeFile.id, schema.downloadQueue.episodeFileId),
        )
        .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
        .where(and(eq(schema.episode.animeId, animeId), eq(schema.downloadQueue.status, 'failed')))
        .all();
      let count = 0;
      for (const row of rows) {
        if (worker.retry(row.id)) {
          count += 1;
        }
      }
      if (count > 0) {
        logger.info({ count, animeId }, 'Download falliti del gruppo rimessi in coda');
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

    async enqueueForAutoFollows() {
      if (!config.get('autoDownload') || !config.isConfigured()) {
        return 0;
      }
      const follows = db
        .select({
          animeId: schema.follow.animeId,
          status: schema.follow.status,
          autoDownload: schema.follow.autoDownload,
          autoDownloadFromEp: schema.follow.autoDownloadFromEp,
          slug: schema.anime.slug,
        })
        .from(schema.follow)
        .innerJoin(schema.anime, eq(schema.follow.animeId, schema.anime.id))
        .all();

      // Eligibilita' dallo stato del SEGUITO, non dallo stato d'onda dell'anime.
      const eligible = follows.filter((f) => {
        if (f.status === 'dropped') return false;
        return f.autoDownload != null ? f.autoDownload === 1 : f.status === 'watching';
      });

      let count = 0;
      let timedOut = false;
      // Timeout globale: evita che un blocco su getBySlug congeli il ciclo per ore.
      const TIMEOUT_MS = 120_000;
      // L'handle va tenuto per poterlo azzerare quando processAll vince la race: altrimenti il
      // setTimeout resterebbe pendente e ~2min dopo ogni ciclo riuscito loggerebbe un timeout
      // spurio (bug A3). unref: non deve tenere vivo il processo.
      let timeoutHandle: NodeJS.Timeout | undefined;
      const timer = new Promise<void>((resolve) => {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          logger.warn(
            { total: eligible.length },
            'enqueueForAutoFollows: timeout 120s — ciclo interrotto (follow parzialmente processati)',
          );
          resolve();
        }, TIMEOUT_MS);
        timeoutHandle.unref?.();
      });

      const processAll = async (): Promise<void> => {
        // Batch da 5: N getBySlug paralleli invece che seriali.
        const BATCH = 5;
        for (let i = 0; i < eligible.length; i += BATCH) {
          if (timedOut) break;
          const batch = eligible.slice(i, i + BATCH);
          const results = await Promise.allSettled(
            batch.map(async (f) => {
              // Rinfresca SEMPRE il catalogo: i nuovi episodi emergono anche quando il sito non
              // aggiorna `?updatedSince`, e un anime COMPLETED si auto-corregge. Best-effort.
              try {
                await catalog.getBySlug(f.slug, { forceRefresh: true });
              } catch (error) {
                logger.debug(
                  { err: error, slug: f.slug },
                  'Refresh auto-download fallito (best-effort)',
                );
              }
              // Forward-only: solo gli episodi oltre la soglia all'attivazione dell'auto-download.
              return addMissingImpl(f.animeId, undefined, true, f.autoDownloadFromEp ?? undefined);
            }),
          );
          results.forEach((r, j) => {
            if (r.status === 'fulfilled' && r.value > 0) {
              count += r.value;
              const follow = batch[j];
              if (follow) {
                deps.onAutoEnqueued?.(follow.animeId, r.value);
              }
            }
          });
        }
      };

      try {
        await Promise.race([processAll(), timer]);
      } finally {
        // processAll ha vinto (o il timeout è già scattato): azzera il timer in ogni caso.
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      }

      if (count > 0) {
        logger.info({ count }, 'Auto-enqueue follow: nuovi episodi accodati');
      }
      return count;
    },
  };
}
