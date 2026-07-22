import { loadEnv } from './env';
import { logger } from './logger';
import { createWorkerLifecycle } from './worker-lifecycle';

async function main(): Promise<void> {
  const env = loadEnv();
  const lifecycle = createWorkerLifecycle({
    config: {
      token: env.WORKER_TOKEN,
      ffmpegBin: env.WORKER_FFMPEG_PATH,
      cacheDir: env.WORKER_SHADER_CACHE,
      workDir: env.WORKER_WORK_DIR,
      port: env.WORKER_PORT,
      host: env.WORKER_HOST,
      jobRetentionHours: env.WORKER_JOB_RETENTION_HOURS,
    },
    logger,
  });

  const shutdown = async (): Promise<void> => {
    await lifecycle.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // `start()` logga "in ascolto" e rilancia se la porta e' occupata.
  await lifecycle.start();
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
