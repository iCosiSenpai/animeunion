/**
 * Entry libreria del worker, SENZA side-effect: è ciò che importa `@animeunion/worker-desktop`
 * (l'app Electron) per incorporare il worker nel proprio processo. La CLI headless resta in
 * `index.ts` (avviata dagli script npm) e non viene toccata da qui: importare questo modulo non
 * avvia alcun server.
 */
export { createWorkerApp } from './app';
export type { WorkerAppConfig } from './app';

export { createWorkerLifecycle } from './worker-lifecycle';
export type {
  WorkerLifecycle,
  WorkerLifecycleDeps,
  WorkerLifecycleState,
  WorkerRuntimeConfig,
  WorkerServer,
  WorkerServerFactory,
  WorkerStatus,
} from './worker-lifecycle';

export { describeReadiness, evaluateFfmpeg, resolveFfmpegPath } from './ffmpeg-readiness';
export type {
  FfmpegEvaluation,
  FfmpegReadiness,
  ReadinessLevel,
  ResolveFfmpegOptions,
} from './ffmpeg-readiness';

export { runGpuSelfTest } from './gpu-selftest';
export type { GpuSelfTestResult } from './gpu-selftest';

export { logger } from './logger';
export type { Logger } from './logger';
