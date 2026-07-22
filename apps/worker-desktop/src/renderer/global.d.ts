import type { WorkerApi } from '../shared/ipc';

declare global {
  interface Window {
    /** Bridge esposto dal preload (vedi src/main/preload.ts). */
    workerApi: WorkerApi;
  }
}
