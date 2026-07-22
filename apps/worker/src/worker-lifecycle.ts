import type { WorkerAppConfig } from './app';
import { createWorkerApp } from './app';
import { logger as defaultLogger } from './logger';
import type { Logger } from './logger';

/**
 * Ciclo di vita del worker Neural Export, incorporabile sia dalla CLI (`index.ts`) sia dall'app
 * desktop Electron. Incapsula config, avvio/arresto e stato osservabile, senza duplicare la logica
 * di `createWorkerApp`. Idempotente: chiamare `start()` piu' volte non riapre un secondo listener.
 */

export type WorkerLifecycleState = 'stopped' | 'starting' | 'running' | 'error';

export interface WorkerRuntimeConfig {
  /** Token condiviso col NAS. Obbligatorio: senza, il render sarebbe aperto sulla LAN. */
  token: string;
  /** Path all'ffmpeg con libplacebo+Vulkan (o nel PATH). */
  ffmpegBin: string;
  cacheDir: string;
  workDir: string;
  port: number;
  host: string;
  jobRetentionHours?: number;
}

export interface WorkerStatus {
  state: WorkerLifecycleState;
  /** Porta effettivamente in ascolto (nota solo quando `running`). */
  port: number | null;
  /** Host su cui il worker ascolta (noto solo quando `running`). */
  host: string | null;
  /** Ultimo errore di avvio, se presente. */
  error: string | null;
}

/** Server minimo richiesto dal lifecycle: compatibile con l'istanza Fastify di `createWorkerApp`. */
export interface WorkerServer {
  listen(opts: { port: number; host: string }): Promise<string>;
  close(): Promise<void>;
}

export type WorkerServerFactory = (config: WorkerAppConfig) => Promise<WorkerServer>;

export interface WorkerLifecycleDeps {
  config: WorkerRuntimeConfig;
  logger?: Logger;
  /** Override della creazione del server (per i test). Default: `createWorkerApp`. */
  createServerImpl?: WorkerServerFactory;
}

export interface WorkerLifecycle {
  /** Avvia il worker; idempotente. Rilancia se l'avvio fallisce (porta occupata, ecc.). */
  start(): Promise<WorkerStatus>;
  /** Arresta il worker; idempotente. */
  stop(): Promise<WorkerStatus>;
  getStatus(): WorkerStatus;
  getConfig(): WorkerRuntimeConfig;
}

/** Estrae la porta effettiva dall'indirizzo restituito da Fastify (es. `http://127.0.0.1:8787`). */
function parsePort(address: string, fallback: number): number {
  const match = address.match(/:(\d+)$/);
  return match ? Number(match[1]) : fallback;
}

export function createWorkerLifecycle(deps: WorkerLifecycleDeps): WorkerLifecycle {
  const logger = deps.logger ?? defaultLogger;
  const createServer: WorkerServerFactory =
    deps.createServerImpl ??
    (async (cfg) => {
      const app = await createWorkerApp(cfg);
      return {
        listen: (opts) => app.listen(opts),
        close: () => app.close(),
      };
    });
  const { config } = deps;

  let state: WorkerLifecycleState = 'stopped';
  let server: WorkerServer | null = null;
  let boundPort: number | null = null;
  let lastError: string | null = null;
  let startInFlight: Promise<WorkerStatus> | null = null;

  function snapshot(): WorkerStatus {
    return {
      state,
      port: state === 'running' ? boundPort : null,
      host: state === 'running' ? config.host : null,
      error: lastError,
    };
  }

  async function doStart(): Promise<WorkerStatus> {
    state = 'starting';
    lastError = null;
    try {
      const app = await createServer({
        token: config.token,
        ffmpegBin: config.ffmpegBin,
        cacheDir: config.cacheDir,
        workDir: config.workDir,
        jobRetentionHours: config.jobRetentionHours,
        logger,
      });
      const address = await app.listen({ port: config.port, host: config.host });
      server = app;
      boundPort = parsePort(address, config.port);
      state = 'running';
      logger.info({ port: boundPort, host: config.host }, 'Worker Neural Export in ascolto');
      return snapshot();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      state = 'error';
      server = null;
      boundPort = null;
      throw error;
    }
  }

  return {
    async start(): Promise<WorkerStatus> {
      if (state === 'running') {
        return snapshot();
      }
      if (startInFlight) {
        return startInFlight;
      }
      startInFlight = doStart().finally(() => {
        startInFlight = null;
      });
      return startInFlight;
    },

    async stop(): Promise<WorkerStatus> {
      // Se un avvio e' in corso, aspetta che si concluda prima di chiudere (evita race).
      if (startInFlight) {
        await startInFlight.catch(() => {});
      }
      if (server) {
        await server.close();
        server = null;
      }
      boundPort = null;
      state = 'stopped';
      lastError = null;
      return snapshot();
    },

    getStatus(): WorkerStatus {
      return snapshot();
    },

    getConfig(): WorkerRuntimeConfig {
      return { ...config };
    },
  };
}
