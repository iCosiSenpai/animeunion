/**
 * Modello di stato mostrato dalla GUI e trasportato via IPC. È deliberatamente disaccoppiato dai tipi
 * interni del worker: il processo main mappa lo stato del lifecycle + la readiness ffmpeg su questi
 * DTO (strutturalmente compatibili). Logica pura e testabile senza Electron.
 */

export type WorkerRuntimeState = 'stopped' | 'starting' | 'running' | 'error';

export interface WorkerRuntimeStatus {
  state: WorkerRuntimeState;
  port: number | null;
  host: string | null;
  error: string | null;
}

export interface GpuReadiness {
  ok: boolean;
  level: 'ok' | 'error';
  title: string;
  hint: string | null;
}

/** Stato sintetico per la UI: un semaforo unico che riassume worker + GPU. */
export type OverallState = 'ready' | 'starting' | 'blocked' | 'stopped' | 'error';

export interface DesktopStatus {
  overall: OverallState;
  /** Frase pronta da mostrare in intestazione. */
  headline: string;
  worker: WorkerRuntimeStatus;
  /** `null` finché il primo probe ffmpeg/GPU non è stato eseguito. */
  gpu: GpuReadiness | null;
  /** Vero solo se il worker è in ascolto E la GPU è pronta: può renderizzare. */
  canRender: boolean;
}

/**
 * Deriva lo stato sintetico. L'errore del worker prevale; a worker avviato lo stato dipende dal
 * probe GPU (assente → ancora in verifica, non pronto → bloccato, pronto → ready).
 */
export function deriveDesktopStatus(
  worker: WorkerRuntimeStatus,
  gpu: GpuReadiness | null,
): DesktopStatus {
  const base = { worker, gpu, canRender: worker.state === 'running' && gpu?.ok === true };

  if (worker.state === 'error') {
    return {
      ...base,
      overall: 'error',
      headline: worker.error ? `Errore del worker: ${worker.error}` : 'Errore del worker',
    };
  }
  if (worker.state === 'starting') {
    return { ...base, overall: 'starting', headline: 'Avvio del worker…' };
  }
  if (worker.state === 'stopped') {
    return { ...base, overall: 'stopped', headline: 'Worker fermo' };
  }
  // worker in esecuzione: lo stato dipende dal probe GPU.
  if (!gpu) {
    return { ...base, overall: 'starting', headline: 'Controllo di ffmpeg e GPU…' };
  }
  if (!gpu.ok) {
    return { ...base, overall: 'blocked', headline: gpu.title };
  }
  return {
    ...base,
    overall: 'ready',
    headline: worker.port ? `Pronto — in ascolto sulla porta ${worker.port}` : 'Pronto',
  };
}
