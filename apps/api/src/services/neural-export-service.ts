import { randomUUID } from 'node:crypto';
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
import type { ProfileService } from './profile-service';
import type { RenamerService } from './renamer-service';

const RECIPE_TTL_MS = 6 * 60 * 60 * 1000;
const HEALTH_TIMEOUT_MS = 3000;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POLL_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2h: un 4K puo' durare a lungo

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
  /** Marca error i job rimasti appesi (queued/running) da un riavvio precedente. */
  recoverInterrupted(): void;
  /** Attende che i processExport in volo terminino (per i test). */
  waitForIdle(): Promise<void>;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function createNeuralExportService(deps: NeuralExportServiceDeps): NeuralExportService {
  const { db, source, config, profile, renamer, logger } = deps;
  const fetchImpl = deps.fetchImpl ?? defaultFetch;
  const downloadFile = deps.downloadFileImpl ?? defaultDownloadFile;
  const verify = deps.verifyImpl ?? verifyVideoFile;
  const now = deps.now ?? (() => new Date());
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const pollTimeoutMs = deps.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;

  let recipeCache: { at: number; recipe: NeuralExportRecipe } | null = null;
  const inFlight = new Set<Promise<void>>();

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
    src: NonNullable<ReturnType<typeof loadSource>>,
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

    await atomicMove(temp, finalPath, logger);
    const info = await stat(finalPath).catch(() => null);
    const iso = now().toISOString();

    // Nuova riga episode_file per la qualita' upscalata: NON tocca la sorgente SD (unique su
    // episode_id+language+quality). onConflict aggiorna un eventuale placeholder rimasto da un
    // tentativo precedente.
    db.insert(schema.episodeFile)
      .values({
        id: randomUUID(),
        episodeId: src.episodeId,
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
    return finalPath;
  }

  async function processExport(jobId: string): Promise<void> {
    try {
      const job = jobRow(jobId);
      if (!job || job.state !== 'queued') {
        return;
      }
      const quality = job.quality as Quality;
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
      const src = loadSource(job.episodeFileId);
      if (!src?.localPath) {
        throw new Error('Sorgente SD non trovata su disco');
      }

      updateJob(jobId, { state: 'running' });

      // Dispatch al worker: MP4 sorgente (streaming da disco via Blob) + payload JSON.
      const form = new FormData();
      form.append('payload', JSON.stringify({ profile: wantedProfile, shaders: recipe.shaders }));
      form.append('source', await openAsBlob(src.localPath), 'source.mp4');
      const dispatch = await fetchImpl(`${trimSlash(workerUrl)}/jobs`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
      });
      if (!dispatch.ok) {
        throw new Error(`Invio al worker fallito (HTTP ${dispatch.status})`);
      }
      const { jobId: workerJobId } = z.object({ jobId: z.string() }).parse(await dispatch.json());
      updateJob(jobId, { workerJobId });

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
      const outputPath = await finalize(jobId, workerJobId, quality, src);
      updateJob(jobId, { state: 'done', progress: 1, outputPath, error: null });
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
      const job = jobRow(jobId);
      if (!job) {
        return false;
      }
      if (job.state === 'done' || job.state === 'error') {
        return false;
      }
      updateJob(jobId, { state: 'cancelled' });
      if (job.workerJobId) {
        const workerUrl = config.get('neuralWorkerUrl');
        const token = config.get('neuralWorkerToken');
        await fetchImpl(`${trimSlash(workerUrl)}/jobs/${job.workerJobId}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${token}` },
        }).catch((error) => {
          logger.debug({ err: error, jobId }, 'DELETE job worker fallito (ignorato)');
        });
      }
      return true;
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
