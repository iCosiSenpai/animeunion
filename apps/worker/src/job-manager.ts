import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildFfmpegArgs,
  buildShaderChain,
  provisionShaders,
  runUpscale,
} from '@animeunion/neural-core';
import type { NeuralExportJobPayload, NeuralWorkerJobStatus } from '@animeunion/shared';
import type { Logger } from './logger';

/**
 * Registry in-memory dei job di render + orchestrazione della pipeline neural-core. Concorrenza 1
 * (GPU singola): i job vanno in coda ed eseguono in sequenza. Gli step di render sono iniettabili per
 * i test (nessuna GPU necessaria).
 */

interface JobRecord {
  id: string;
  state: NeuralWorkerJobStatus['state'];
  progress: number;
  error: string | null;
  sourcePath: string;
  outputPath: string;
  payload: NeuralExportJobPayload;
  controller: AbortController;
  createdAt: number;
}

export interface JobManagerDeps {
  ffmpegBin: string;
  cacheDir: string;
  workDir: string;
  logger: Logger;
  provisionShadersImpl?: typeof provisionShaders;
  buildShaderChainImpl?: typeof buildShaderChain;
  runUpscaleImpl?: typeof runUpscale;
}

export interface JobManager {
  create(id: string, payload: NeuralExportJobPayload, sourcePath: string): void;
  get(id: string): NeuralWorkerJobStatus | null;
  resultPath(id: string): string | null;
  cancel(id: string): boolean;
  cleanupOld(maxAgeMs: number): Promise<void>;
}

export function createJobManager(deps: JobManagerDeps): JobManager {
  const provision = deps.provisionShadersImpl ?? provisionShaders;
  const buildChain = deps.buildShaderChainImpl ?? buildShaderChain;
  const runFfmpeg = deps.runUpscaleImpl ?? runUpscale;
  const { logger } = deps;

  const jobs = new Map<string, JobRecord>();
  const queue: string[] = [];
  let running = false;

  function status(job: JobRecord): NeuralWorkerJobStatus {
    return { id: job.id, state: job.state, progress: job.progress, error: job.error };
  }

  async function cleanupJobFiles(job: JobRecord): Promise<void> {
    await rm(job.sourcePath, { force: true }).catch(() => {});
    await rm(join(deps.workDir, `${job.id}.glsl`), { force: true }).catch(() => {});
    // L'output resta finche' non viene scaricato (o ripulito da cleanupOld / cancel).
  }

  async function runJob(job: JobRecord): Promise<void> {
    if (job.controller.signal.aborted) {
      return;
    }
    job.state = 'running';
    try {
      await provision(job.payload.shaders, deps.cacheDir);
      const chainName = `${job.id}.glsl`;
      await buildChain(job.payload.profile, deps.cacheDir, join(deps.workDir, chainName));
      const args = buildFfmpegArgs({
        profile: job.payload.profile,
        inputPath: job.sourcePath,
        outputPath: job.outputPath,
        // Basename relativo alla cwd (workDir): evita l'escaping di path Windows nel filtergraph.
        shaderChainPath: chainName,
      });
      const result = await runFfmpeg({
        ffmpegBin: deps.ffmpegBin,
        args,
        cwd: deps.workDir,
        signal: job.controller.signal,
      });
      if (result.aborted) {
        job.state = 'error';
        job.error = 'Annullato';
      } else if (result.ok) {
        job.state = 'done';
        job.progress = 1;
      } else {
        job.state = 'error';
        job.error = result.spawnFailed
          ? 'ffmpeg non eseguibile (build libplacebo assente?)'
          : `ffmpeg uscito con codice ${result.code}: ${result.stderr.slice(-300)}`;
      }
    } catch (error) {
      job.state = 'error';
      job.error = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, jobId: job.id }, 'Render job fallito');
    } finally {
      await cleanupJobFiles(job);
    }
  }

  async function pump(): Promise<void> {
    if (running) {
      return;
    }
    running = true;
    try {
      while (queue.length > 0) {
        const id = queue.shift();
        if (!id) {
          continue;
        }
        const job = jobs.get(id);
        if (!job || job.state !== 'queued') {
          continue;
        }
        await runJob(job);
      }
    } finally {
      running = false;
    }
  }

  return {
    create(id, payload, sourcePath): void {
      const job: JobRecord = {
        id,
        state: 'queued',
        progress: 0,
        error: null,
        sourcePath,
        outputPath: join(deps.workDir, `${id}.out.mp4`),
        payload,
        controller: new AbortController(),
        createdAt: Date.now(),
      };
      jobs.set(id, job);
      queue.push(id);
      void pump();
    },

    get(id): NeuralWorkerJobStatus | null {
      const job = jobs.get(id);
      return job ? status(job) : null;
    },

    resultPath(id): string | null {
      const job = jobs.get(id);
      return job && job.state === 'done' ? job.outputPath : null;
    },

    cancel(id): boolean {
      const job = jobs.get(id);
      if (!job) {
        return false;
      }
      job.controller.abort();
      if (job.state === 'queued') {
        job.state = 'error';
        job.error = 'Annullato';
      }
      void rm(job.outputPath, { force: true }).catch(() => {});
      return true;
    },

    async cleanupOld(maxAgeMs): Promise<void> {
      const now = Date.now();
      for (const [id, job] of jobs) {
        if (now - job.createdAt > maxAgeMs) {
          await cleanupJobFiles(job);
          await rm(job.outputPath, { force: true }).catch(() => {});
          jobs.delete(id);
        }
      }
    },
  };
}

export async function ensureWorkerDirs(cacheDir: string, workDir: string): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
  await mkdir(workDir, { recursive: true });
}
