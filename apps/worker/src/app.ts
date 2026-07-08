import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { probeCapabilities } from '@animeunion/neural-core';
import { type NeuralWorkerHealth, neuralExportJobPayloadSchema } from '@animeunion/shared';
import multipart from '@fastify/multipart';
import fastify from 'fastify';
import { type JobManager, createJobManager, ensureWorkerDirs } from './job-manager';
import { logger as defaultLogger } from './logger';
import type { Logger } from './logger';

const HEALTH_CACHE_MS = 30_000;
// Limite generoso per l'upload dell'MP4 sorgente (episodio 720p): 10 GB.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024;

export interface WorkerAppConfig {
  token: string;
  ffmpegBin: string;
  cacheDir: string;
  workDir: string;
  jobRetentionHours?: number;
  logger?: Logger;
  jobManager?: JobManager;
  /** Override del probe capacita' (per i test). */
  probeImpl?: typeof probeCapabilities;
}

export async function createWorkerApp(config: WorkerAppConfig) {
  const logger = config.logger ?? defaultLogger;
  const probe = config.probeImpl ?? probeCapabilities;
  await ensureWorkerDirs(config.cacheDir, config.workDir);
  const jobs =
    config.jobManager ??
    createJobManager({
      ffmpegBin: config.ffmpegBin,
      cacheDir: config.cacheDir,
      workDir: config.workDir,
      logger,
    });

  const app = fastify({ loggerInstance: logger });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  // Pulizia periodica dei file temporanei dei job scaduti.
  const retentionMs = (config.jobRetentionHours ?? 24) * 60 * 60 * 1000;
  const cleanupTimer = setInterval(
    () => {
      void jobs.cleanupOld(retentionMs);
    },
    60 * 60 * 1000,
  );
  cleanupTimer.unref?.();
  app.addHook('onClose', async () => clearInterval(cleanupTimer));

  // Auth a token condiviso su OGNI rotta: senza il Bearer corretto, 401.
  app.addHook('onRequest', async (req, reply) => {
    const header = req.headers.authorization;
    if (header !== `Bearer ${config.token}`) {
      await reply.code(401).send({ error: 'Token worker non valido o assente' });
    }
  });

  let healthCache: { at: number; value: NeuralWorkerHealth } | null = null;
  app.get('/health', async (): Promise<NeuralWorkerHealth> => {
    if (healthCache && Date.now() - healthCache.at < HEALTH_CACHE_MS) {
      return healthCache.value;
    }
    const caps = await probe(config.ffmpegBin);
    const value: NeuralWorkerHealth = { ok: caps.ffmpegCapable && caps.hasVulkan, ...caps };
    healthCache = { at: Date.now(), value };
    return value;
  });

  app.post('/jobs', async (req, reply) => {
    const jobId = randomUUID();
    const srcPath = join(config.workDir, `${jobId}.src.mp4`);
    let payloadRaw: string | undefined;
    let savedFile = false;

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        await pipeline(part.file, createWriteStream(srcPath));
        if (part.file.truncated) {
          return reply.code(413).send({ error: 'File sorgente troppo grande' });
        }
        savedFile = true;
      } else if (part.fieldname === 'payload' && typeof part.value === 'string') {
        payloadRaw = part.value;
      }
    }

    if (!savedFile || !payloadRaw) {
      return reply.code(400).send({ error: 'Attesi campo file "source" e campo "payload" JSON' });
    }
    let payload: unknown;
    try {
      payload = JSON.parse(payloadRaw);
    } catch {
      return reply.code(400).send({ error: 'payload non e JSON valido' });
    }
    const parsed = neuralExportJobPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'payload non valido', detail: parsed.error.message });
    }

    jobs.create(jobId, parsed.data, srcPath);
    return reply.code(202).send({ jobId });
  });

  app.get<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const job = jobs.get(req.params.id);
    if (!job) {
      return reply.code(404).send({ error: 'Job non trovato' });
    }
    return job;
  });

  app.get<{ Params: { id: string } }>('/jobs/:id/result', async (req, reply) => {
    const status = jobs.get(req.params.id);
    if (!status) {
      return reply.code(404).send({ error: 'Job non trovato' });
    }
    if (status.state !== 'done') {
      return reply.code(409).send({ error: `Job non pronto (stato: ${status.state})` });
    }
    const path = jobs.resultPath(req.params.id);
    if (!path) {
      return reply.code(409).send({ error: 'Risultato non disponibile' });
    }
    const info = await stat(path).catch(() => null);
    if (!info) {
      return reply.code(410).send({ error: 'Output rimosso' });
    }
    reply.header('content-type', 'video/mp4');
    reply.header('content-length', info.size);
    return reply.send(createReadStream(path));
  });

  app.delete<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const ok = jobs.cancel(req.params.id);
    if (!ok) {
      return reply.code(404).send({ error: 'Job non trovato' });
    }
    return { cancelled: true };
  });

  return app;
}
