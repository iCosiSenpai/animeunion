import { createWorkerApp } from './app';
import { loadEnv } from './env';
import { logger } from './logger';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await createWorkerApp({
    token: env.WORKER_TOKEN,
    ffmpegBin: env.WORKER_FFMPEG_PATH,
    cacheDir: env.WORKER_SHADER_CACHE,
    workDir: env.WORKER_WORK_DIR,
    jobRetentionHours: env.WORKER_JOB_RETENTION_HOURS,
  });

  const shutdown = async (): Promise<void> => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: env.WORKER_PORT, host: env.WORKER_HOST });
  logger.info(
    { port: env.WORKER_PORT, ffmpeg: env.WORKER_FFMPEG_PATH },
    'Worker Neural Export in ascolto',
  );
}

process.on('unhandledRejection', (reason) => {
  logger.warn({ reason }, 'Promise rejection non gestita');
});
process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Eccezione non catturata — uscita forzata');
  process.exit(1);
});

main().catch((error) => {
  logger.error(error, 'Avvio del worker fallito');
  process.exit(1);
});
