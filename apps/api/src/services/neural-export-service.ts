import { randomInt, randomUUID } from 'node:crypto';
import { createWriteStream, openAsBlob } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  type AnimeSource,
  type NeuralExportJobView,
  type NeuralExportRecipe,
  type NeuralExportStatus,
  type NeuralPairRequest,
  type NeuralPairResult,
  type NeuralPairingCode,
  type NeuralWorkerHealth,
  type Quality,
  hasNeuralExport,
  neuralWorkerHealthSchema,
  neuralWorkerJobStatusSchema,
  profileIdForQuality,
  qualityForProfileId,
} from '@animeunion/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { FormData, fetch as undiciFetch } from 'undici';
import { z } from 'zod';
import type { Db } from '../db';
import { schema } from '../db';
import { atomicMove, ensureDir, tempPath } from '../lib/download-fs';
import { NotFoundError, PreconditionError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import { verifyVideoFile } from '../lib/video-verify';
import type { ConfigService } from './config-service';
import type { FileMutationCoordinator } from './file-mutation-coordinator';
import type { ProfileService } from './profile-service';
import type { RenamerService } from './renamer-service';

const RECIPE_TTL_MS = 6 * 60 * 60 * 1000;
const HEALTH_TIMEOUT_MS = 3000;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POLL_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2h: un 4K puo' durare a lungo
const PAIRING_CODE_TTL_MS = 5 * 60 * 1000; // 5 min: finestra per completare l'abbinamento

interface NeuralSourceGeneration {
  updatedAt: string;
  downloadedAt: string | null;
  fileSize: number | null;
  dev: string;
  ino: string;
  size: string;
  mtimeNs: string;
  ctimeNs: string;
  birthtimeNs: string;
}

async function captureSourceGeneration(source: {
  localPath: string;
  updatedAt: string;
  downloadedAt: string | null;
  fileSize: number | null;
}): Promise<NeuralSourceGeneration> {
  const info = await stat(source.localPath, { bigint: true });
  return {
    updatedAt: source.updatedAt,
    downloadedAt: source.downloadedAt,
    fileSize: source.fileSize,
    dev: info.dev.toString(),
    ino: info.ino.toString(),
    size: info.size.toString(),
    mtimeNs: info.mtimeNs.toString(),
    ctimeNs: info.ctimeNs.toString(),
    birthtimeNs: info.birthtimeNs.toString(),
  };
}

function sameSourceGeneration(
  expected: NeuralSourceGeneration,
  current: NeuralSourceGeneration,
): boolean {
  return (
    expected.updatedAt === current.updatedAt &&
    expected.downloadedAt === current.downloadedAt &&
    expected.fileSize === current.fileSize &&
    expected.dev === current.dev &&
    expected.ino === current.ino &&
    expected.size === current.size &&
    expected.mtimeNs === current.mtimeNs &&
    expected.ctimeNs === current.ctimeNs &&
    expected.birthtimeNs === current.birthtimeNs
  );
}

// Seam HTTP verso il worker (iniettabile nei test): niente accesso di rete nei test unitari.
export interface NeuralFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export interface NeuralFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: FormData;
  signal?: AbortSignal;
}
export type NeuralFetch = (url: string, init?: NeuralFetchInit) => Promise<NeuralFetchResponse>;
export type NeuralDownloadFile = (
  url: string,
  headers: Record<string, string>,
  destPath: string,
) => Promise<void>;

const defaultFetch: NeuralFetch = async (url, init) => {
  const res = await undiciFetch(url, {
    method: init?.method,
    headers: init?.headers,
    body: init?.body,
    signal: init?.signal,
  });
  return { ok: res.ok, status: res.status, json: () => res.json() };
};

const defaultDownloadFile: NeuralDownloadFile = async (url, headers, destPath) => {
  const res = await undiciFetch(url, { headers });
  if (!res.ok || !res.body) {
    throw new Error(`Download risultato fallito (HTTP ${res.status})`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
};

export interface NeuralExportServiceDeps {
  db: Db;
  source: AnimeSource;
  config: ConfigService;
  profile: ProfileService;
  renamer: RenamerService;
  logger: Logger;
  coordinator: FileMutationCoordinator;
  fetchImpl?: NeuralFetch;
  downloadFileImpl?: NeuralDownloadFile;
  verifyImpl?: typeof verifyVideoFile;
  now?: () => Date;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

export interface NeuralExportService {
  getStatus(): Promise<NeuralExportStatus>;
  exportEpisode(input: { episodeFileId: string; quality: 'XQ' | 'XQPLUS' }): Promise<{
    jobId: string;
  }>;
  listJobs(limit?: number): NeuralExportJobView[];
  cancel(jobId: string): Promise<boolean>;
  /** Genera un codice di abbinamento breve a scadenza (mostrato in Impostazioni). */
  createPairingCode(): NeuralPairingCode;
  /** Completa l'abbinamento: valida il codice, verifica il worker e salva la config. */
  pair(input: NeuralPairRequest): Promise<NeuralPairResult>;
  /** Marca error i job rimasti appesi (queued/running) da un riavvio precedente. */
  recoverInterrupted(): void;
  /** Attende che i processExport in volo terminino (per i test). */
  waitForIdle(): Promise<void>;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function createNeuralExportService(deps: NeuralExportServiceDeps): NeuralExportService {
  const { db, source, config, profile, renamer, logger, coordinator } = deps;
  const fetchImpl = deps.fetchImpl ?? defaultFetch;
  const downloadFile = deps.downloadFileImpl ?? defaultDownloadFile;
  const verify = deps.verifyImpl ?? verifyVideoFile;
  const now = deps.now ?? (() => new Date());
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const pollTimeoutMs = deps.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;

  let recipeCache: { at: number; recipe: NeuralExportRecipe } | null = null;
  const inFlight = new Set<Promise<void>>();
  // Codici di abbinamento attivi: codice -> scadenza (epoch ms). In-memory: il pairing è un gesto
  // interattivo di pochi minuti, non deve sopravvivere a un riavvio del NAS.
  const pairingCodes = new Map<string, number>();

  function prunePairingCodes(nowMs: number): void {
    for (const [code, expiry] of pairingCodes) {
      if (expiry <= nowMs) {
        pairingCodes.delete(code);
      }
    }
  }

  async function getRecipe(): Promise<NeuralExportRecipe | null> {
    if (recipeCache && now().getTime() - recipeCache.at < RECIPE_TTL_MS) {
      return recipeCache.recipe;
    }
    if (!source.getNeuralExportProfile) {
      return null;
    }
    try {
      const recipe = await source.getNeuralExportProfile();
      recipeCache = { at: now().getTime(), recipe };
      return recipe;
    } catch (error) {
      logger.debug({ err: error }, 'Ricetta Neural Export non disponibile');
      return recipeCache?.recipe ?? null;
    }
  }

  async function pingWorker(url: string, token: string): Promise<NeuralWorkerHealth | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${trimSlash(url)}/health`, {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        return null;
      }
      return neuralWorkerHealthSchema.parse(await res.json());
    } catch (error) {
      logger.debug({ err: error }, 'Worker Neural Export non raggiungibile');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function jobRow(jobId: string) {
    return db
      .select()
      .from(schema.neuralExportJob)
      .where(eq(schema.neuralExportJob.id, jobId))
      .get();
  }

  function updateJob(
    jobId: string,
    fields: Partial<{
      state: string;
      workerJobId: string;
      progress: number;
      error: string | null;
      outputPath: string;
    }>,
  ): void {
    db.update(schema.neuralExportJob)
      .set({ ...fields, updatedAt: now().toISOString() })
      .where(eq(schema.neuralExportJob.id, jobId))
      .run();
  }

  async function cancelWorkerJob(workerJobId: string, jobId: string): Promise<void> {
    const workerUrl = config.get('neuralWorkerUrl');
    const token = config.get('neuralWorkerToken');
    await fetchImpl(`${trimSlash(workerUrl)}/jobs/${workerJobId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    }).catch((error) => {
      logger.debug({ err: error, jobId }, 'DELETE job worker fallito (ignorato)');
    });
  }

  /** Sorgente SD + coordinate episodio per il renamer. */
  function loadSource(episodeFileId: string) {
    return db
      .select({
        id: schema.episodeFile.id,
        episodeId: schema.episodeFile.episodeId,
        language: schema.episodeFile.language,
        quality: schema.episodeFile.quality,
        downloadStatus: schema.episodeFile.downloadStatus,
        localPath: schema.episodeFile.localPath,
        fileSize: schema.episodeFile.fileSize,
        downloadedAt: schema.episodeFile.downloadedAt,
        updatedAt: schema.episodeFile.updatedAt,
        animeId: schema.episode.animeId,
        episodeNumber: schema.episode.number,
      })
      .from(schema.episodeFile)
      .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
      .where(eq(schema.episodeFile.id, episodeFileId))
      .get();
  }

  async function finalize(
    jobId: string,
    workerJobId: string,
    quality: Quality,
    src: NonNullable<ReturnType<typeof loadSource>> & { localPath: string },
    sourceGeneration: NeuralSourceGeneration,
  ): Promise<string> {
    const workerUrl = config.get('neuralWorkerUrl');
    const token = config.get('neuralWorkerToken');
    const language = src.language as 'SUB_ITA' | 'DUB_ITA';
    const finalPath = renamer.computeEpisodePath({
      animeId: src.animeId,
      episodeNumber: src.episodeNumber,
      language,
      quality,
    });
    await ensureDir(dirname(finalPath), logger);
    const temp = tempPath(finalPath, jobId);
    await downloadFile(
      `${trimSlash(workerUrl)}/jobs/${workerJobId}/result`,
      {
        authorization: `Bearer ${token}`,
      },
      temp,
    );

    const check = await verify(temp, { logger });
    if (!check.ok) {
      await rm(temp, { force: true }).catch(() => {});
      throw new Error(`Verifica integrita output fallita: ${check.reason ?? 'non riproducibile'}`);
    }

    return coordinator.runExclusive(async () => {
      const currentSource = loadSource(src.id);
      const currentJob = jobRow(jobId);
      if (
        !currentSource ||
        currentSource.downloadStatus !== 'downloaded' ||
        currentSource.localPath !== src.localPath ||
        currentJob?.state !== 'running' ||
        currentJob.episodeFileId !== src.id ||
        currentJob.workerJobId !== workerJobId ||
        currentJob.quality !== quality
      ) {
        await rm(temp, { force: true }).catch(() => {});
        throw new PreconditionError(
          'Output Neural non finalizzato: sorgente o job modificati durante il render.',
        );
      }

      // Path e status da soli permettono un ABA (delete + relink di byte diversi allo stesso path).
      // La generazione combina i marker DB con l'identità fisica ad alta risoluzione del file.
      const currentGeneration = await captureSourceGeneration({
        ...currentSource,
        localPath: currentSource.localPath,
      }).catch(() => null);
      if (!currentGeneration || !sameSourceGeneration(sourceGeneration, currentGeneration)) {
        await rm(temp, { force: true }).catch(() => {});
        throw new PreconditionError(
          'Output Neural non finalizzato: la generazione della sorgente è cambiata durante il render.',
        );
      }

      const existing = db
        .select({ status: schema.episodeFile.downloadStatus })
        .from(schema.episodeFile)
        .where(
          and(
            eq(schema.episodeFile.episodeId, currentSource.episodeId),
            eq(schema.episodeFile.language, language),
            eq(schema.episodeFile.quality, quality),
          ),
        )
        .get();
      if (existing?.status === 'external' || existing?.status === 'downloaded') {
        await rm(temp, { force: true }).catch(() => {});
        throw new PreconditionError(
          `Output Neural non finalizzato: la qualità richiesta è diventata ${existing.status}.`,
        );
      }

      await atomicMove(temp, finalPath, logger);
      const info = await stat(finalPath).catch(() => null);
      const iso = now().toISOString();

      // Nuova riga episode_file per la qualita' upscalata: NON tocca la sorgente SD (unique su
      // episode_id+language+quality). onConflict aggiorna un eventuale placeholder rimasto da un
      // tentativo precedente.
      db.insert(schema.episodeFile)
        .values({
          id: randomUUID(),
          episodeId: currentSource.episodeId,
          language,
          quality,
          downloadStatus: 'downloaded',
          localPath: finalPath,
          fileSize: info?.size ?? null,
          downloadedAt: iso,
          createdAt: iso,
          updatedAt: iso,
        })
        .onConflictDoUpdate({
          target: [
            schema.episodeFile.episodeId,
            schema.episodeFile.language,
            schema.episodeFile.quality,
          ],
          set: {
            downloadStatus: 'downloaded',
            localPath: finalPath,
            fileSize: info?.size ?? null,
            downloadedAt: iso,
            updatedAt: iso,
          },
        })
        .run();
      // Il job viene completato nello stesso tratto coordinato della pubblicazione dell'output:
      // una cancellazione accodata non può inserirsi tra l'upsert e lo stato `done`.
      updateJob(jobId, { state: 'done', progress: 1, outputPath: finalPath, error: null });
      return finalPath;
    });
  }

  async function processExport(jobId: string): Promise<void> {
    try {
      const queuedJob = jobRow(jobId);
      if (!queuedJob || queuedJob.state !== 'queued') {
        return;
      }
      const quality = queuedJob.quality as Quality;
      const workerUrl = config.get('neuralWorkerUrl');
      const token = config.get('neuralWorkerToken');
      const recipe = await getRecipe();
      if (!recipe) {
        throw new Error('Ricetta Neural Export non disponibile');
      }
      const profileId = profileIdForQuality(quality);
      const wantedProfile = recipe.profiles.find((p) => p.id === profileId);
      if (!wantedProfile) {
        throw new Error(`Profilo ${profileId} assente nella ricetta`);
      }

      // CAS SQLite: recipe/profile possono aver atteso rete mentre l'utente cancellava il job.
      // Il tratto è sincrono e non trattiene il coordinatore filesystem durante il render.
      const started = db
        .update(schema.neuralExportJob)
        .set({ state: 'running', updatedAt: now().toISOString() })
        .where(
          and(eq(schema.neuralExportJob.id, jobId), eq(schema.neuralExportJob.state, 'queued')),
        )
        .run();
      if (started.changes === 0) {
        return;
      }
      const currentSource = loadSource(queuedJob.episodeFileId);
      if (
        !currentSource?.localPath ||
        currentSource.downloadStatus !== 'downloaded' ||
        currentSource.quality !== 'SD'
      ) {
        throw new PreconditionError('Sorgente SD non più disponibile per il render');
      }
      const src = { ...currentSource, localPath: currentSource.localPath };

      // La generazione viene fissata prima del dispatch: finalize richiede sia gli stessi marker DB
      // sia lo stesso oggetto filesystem, così un delete/relink allo stesso path non è un falso match.
      const sourceGeneration = await captureSourceGeneration(src);
      // Dispatch al worker: MP4 sorgente (streaming da disco via Blob) + payload JSON. Il blob viene
      // preparato fuori lock; se nel frattempo il cancel ha vinto, non inviamo nemmeno il POST.
      const sourceBlob = await openAsBlob(src.localPath);
      if (jobRow(jobId)?.state !== 'running') {
        return;
      }
      const form = new FormData();
      form.append('payload', JSON.stringify({ profile: wantedProfile, shaders: recipe.shaders }));
      form.append('source', sourceBlob, 'source.mp4');
      const dispatch = await fetchImpl(`${trimSlash(workerUrl)}/jobs`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
      });
      if (!dispatch.ok) {
        throw new Error(`Invio al worker fallito (HTTP ${dispatch.status})`);
      }
      const { jobId: workerJobId } = z.object({ jobId: z.string() }).parse(await dispatch.json());
      const registered = db
        .update(schema.neuralExportJob)
        .set({ workerJobId, updatedAt: now().toISOString() })
        .where(
          and(eq(schema.neuralExportJob.id, jobId), eq(schema.neuralExportJob.state, 'running')),
        )
        .run();
      if (registered.changes === 0) {
        // Il cancel può vincere mentre il POST è in volo, prima che il worker ID sia noto al DB.
        // Appena riceviamo l'ID compensiamo sul worker remoto e non avviamo il polling.
        await cancelWorkerJob(workerJobId, jobId);
        return;
      }

      // Polling dello stato del worker.
      const deadline = now().getTime() + pollTimeoutMs;
      for (;;) {
        if (jobRow(jobId)?.state === 'cancelled') {
          return;
        }
        const res = await fetchImpl(`${trimSlash(workerUrl)}/jobs/${workerJobId}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Worker non raggiungibile durante il polling (HTTP ${res.status})`);
        }
        const status = neuralWorkerJobStatusSchema.parse(await res.json());
        if (status.progress > 0) {
          updateJob(jobId, { progress: status.progress });
        }
        if (status.state === 'done') {
          break;
        }
        if (status.state === 'error') {
          throw new Error(status.error ?? 'Render fallito sul worker');
        }
        if (now().getTime() > deadline) {
          throw new Error('Timeout del render neurale');
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }

      if (jobRow(jobId)?.state === 'cancelled') {
        return;
      }
      const outputPath = await finalize(jobId, workerJobId, quality, src, sourceGeneration);
      logger.info({ jobId, quality, outputPath }, 'Export neurale completato');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Non sovrascrivere un annullamento con un errore.
      if (jobRow(jobId)?.state !== 'cancelled') {
        updateJob(jobId, { state: 'error', error: message });
      }
      logger.error({ err: error, jobId }, 'Export neurale fallito');
    }
  }

  function track(promise: Promise<void>): void {
    inFlight.add(promise);
    void promise.finally(() => inFlight.delete(promise));
  }

  return {
    async getStatus(): Promise<NeuralExportStatus> {
      const userProfile = await profile.getMe();
      const entitled = hasNeuralExport(userProfile);
      const enabled = config.get('neuralExportEnabled');
      const workerUrl = config.get('neuralWorkerUrl');
      const token = config.get('neuralWorkerToken');
      const configured = workerUrl.trim() !== '' && token.trim() !== '';

      const recipe = entitled ? await getRecipe() : null;
      const profiles = recipe
        ? recipe.profiles.map((p) => ({
            id: p.id,
            quality: qualityForProfileId(p.id),
            targetWidth: p.targetWidth,
            targetHeight: p.targetHeight,
          }))
        : [];

      let reachable = false;
      let ffmpegCapable = false;
      let fps: number | null = null;
      if (configured && enabled) {
        const health = await pingWorker(workerUrl, token);
        if (health) {
          reachable = true;
          ffmpegCapable = health.ffmpegCapable && health.hasVulkan;
          fps = health.fps;
        }
      }

      const available =
        entitled && enabled && configured && reachable && ffmpegCapable && profiles.length > 0;
      return {
        available,
        entitled,
        recipeVersion: recipe?.version ?? null,
        profiles,
        worker: { configured, enabled, reachable, ffmpegCapable, fps },
      };
    },

    async exportEpisode({ episodeFileId, quality }): Promise<{ jobId: string }> {
      const userProfile = await profile.getMe();
      if (!hasNeuralExport(userProfile)) {
        throw new PreconditionError('Il tuo piano non include il download neurale');
      }
      if (!config.get('neuralExportEnabled')) {
        throw new PreconditionError('Neural Export non abilitato nelle impostazioni');
      }
      const workerUrl = config.get('neuralWorkerUrl');
      const token = config.get('neuralWorkerToken');
      if (workerUrl.trim() === '' || token.trim() === '') {
        throw new PreconditionError('Worker Neural Export non configurato');
      }

      const src = loadSource(episodeFileId);
      if (!src) {
        throw new NotFoundError('Episodio non trovato');
      }
      if (src.quality !== 'SD') {
        throw new PreconditionError('La sorgente da upscalare deve essere in qualita SD');
      }
      // Solo sorgenti scaricate dall'app. Gli external (file collegati senza scaricare) hanno
      // anch'essi un localPath e sarebbero candidati validi, ma restano esclusi finche' il collaudo
      // end-to-end del worker su MP4/MKV non-AnimeUnion non e' fatto sul PC con GPU (Step 9, dec. B).
      if (src.downloadStatus !== 'downloaded' || !src.localPath) {
        throw new PreconditionError('Scarica prima l episodio in SD');
      }

      // Idempotenza: se c'e' gia' un job attivo per (episodio, qualita'), riusalo.
      const active = db
        .select({ id: schema.neuralExportJob.id })
        .from(schema.neuralExportJob)
        .where(
          and(
            eq(schema.neuralExportJob.episodeFileId, episodeFileId),
            eq(schema.neuralExportJob.quality, quality),
            inArray(schema.neuralExportJob.state, ['queued', 'running']),
          ),
        )
        .get();
      if (active) {
        return { jobId: active.id };
      }

      // Gia' presente su disco?
      const existing = db
        .select({ status: schema.episodeFile.downloadStatus })
        .from(schema.episodeFile)
        .where(
          and(
            eq(schema.episodeFile.episodeId, src.episodeId),
            eq(schema.episodeFile.language, src.language),
            eq(schema.episodeFile.quality, quality),
          ),
        )
        .get();
      if (existing?.status === 'downloaded') {
        throw new PreconditionError('Questa qualita e gia disponibile per l episodio');
      }

      const jobId = randomUUID();
      const iso = now().toISOString();
      db.insert(schema.neuralExportJob)
        .values({
          id: jobId,
          episodeFileId,
          quality,
          state: 'queued',
          progress: 0,
          createdAt: iso,
          updatedAt: iso,
        })
        .run();

      track(processExport(jobId));
      return { jobId };
    },

    listJobs(limit = 50): NeuralExportJobView[] {
      const rows = db
        .select({
          id: schema.neuralExportJob.id,
          episodeFileId: schema.neuralExportJob.episodeFileId,
          quality: schema.neuralExportJob.quality,
          state: schema.neuralExportJob.state,
          progress: schema.neuralExportJob.progress,
          error: schema.neuralExportJob.error,
          createdAt: schema.neuralExportJob.createdAt,
          updatedAt: schema.neuralExportJob.updatedAt,
          episodeNumber: schema.episode.number,
          animeTitle: schema.anime.title,
          animeTitleIta: schema.anime.titleIta,
        })
        .from(schema.neuralExportJob)
        .innerJoin(
          schema.episodeFile,
          eq(schema.episodeFile.id, schema.neuralExportJob.episodeFileId),
        )
        .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
        .innerJoin(schema.anime, eq(schema.anime.id, schema.episode.animeId))
        .orderBy(desc(schema.neuralExportJob.createdAt))
        .limit(limit)
        .all();

      return rows.map((r) => ({
        id: r.id,
        episodeFileId: r.episodeFileId,
        animeTitle: r.animeTitleIta ?? r.animeTitle ?? null,
        episodeNumber: r.episodeNumber ?? null,
        quality: r.quality as Quality,
        state: r.state as NeuralExportJobView['state'],
        progress: r.progress ?? 0,
        error: r.error ?? null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    },

    async cancel(jobId): Promise<boolean> {
      // Serializza solo la decisione DB con finalize; la DELETE di rete resta volutamente fuori lock.
      const job = await coordinator.runExclusive(async () => {
        const current = jobRow(jobId);
        if (!current || current.state === 'done' || current.state === 'error') {
          return null;
        }
        updateJob(jobId, { state: 'cancelled' });
        return current;
      });
      if (!job) {
        return false;
      }
      if (job.workerJobId) {
        await cancelWorkerJob(job.workerJobId, jobId);
      }
      return true;
    },

    createPairingCode(): NeuralPairingCode {
      const nowMs = now().getTime();
      prunePairingCodes(nowMs);
      // Codice numerico a 6 cifre: facile da leggere e digitare nell'app desktop.
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const expiry = nowMs + PAIRING_CODE_TTL_MS;
      pairingCodes.set(code, expiry);
      return { code, expiresAt: new Date(expiry).toISOString() };
    },

    async pair({ code, workerUrl, token }): Promise<NeuralPairResult> {
      const nowMs = now().getTime();
      prunePairingCodes(nowMs);
      const expiry = pairingCodes.get(code);
      if (!expiry || expiry <= nowMs) {
        throw new PreconditionError('Codice di abbinamento non valido o scaduto');
      }

      // Verifica che il NAS raggiunga davvero il worker con l'URL/token forniti dall'app.
      const url = trimSlash(workerUrl.trim());
      const health = await pingWorker(url, token);
      if (!health) {
        // Codice NON consumato: l'utente può ritentare entro la scadenza dopo aver risolto la rete.
        throw new PreconditionError(
          'Worker non raggiungibile dal NAS: verifica che il PC e il worker siano accesi e sulla stessa rete.',
        );
      }

      // Successo: consuma il codice (monouso) e salva la config. Il token è cifrato dal config service.
      pairingCodes.delete(code);
      config.set('neuralWorkerUrl', url);
      config.set('neuralWorkerToken', token);
      config.set('neuralExportEnabled', true);
      return {
        paired: true,
        reachable: true,
        ffmpegCapable: health.ffmpegCapable && health.hasVulkan,
        fps: health.fps,
      };
    },

    recoverInterrupted(): void {
      const iso = now().toISOString();
      const affected = db
        .update(schema.neuralExportJob)
        .set({ state: 'error', error: 'Interrotto da un riavvio', updatedAt: iso })
        .where(inArray(schema.neuralExportJob.state, ['queued', 'running']))
        .run();
      if (affected.changes > 0) {
        logger.info({ count: affected.changes }, 'Export neurali interrotti recuperati (error)');
      }
    },

    async waitForIdle(): Promise<void> {
      await Promise.all([...inFlight]);
    },
  };
}
