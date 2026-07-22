import type { PairOutcome } from './pairing';
import type { DesktopStatus } from './status';

/**
 * Contratto IPC tra processo main (Electron) e renderer (React). I nomi dei canali sono costanti
 * condivise per evitare stringhe magiche divergenti tra i due lati. Le API `invoke` sono
 * request/response; `statusChanged` è un evento push dal main al renderer.
 */
export const IPC = {
  /** invoke → DesktopStatus corrente. */
  getStatus: 'worker:get-status',
  /** invoke → riavvia il worker, restituisce il nuovo DesktopStatus. */
  restartWorker: 'worker:restart',
  /** evento main→renderer: nuovo DesktopStatus. */
  statusChanged: 'worker:status-changed',
  /** invoke → boolean: avvio automatico al login attivo? */
  getAutostart: 'app:get-autostart',
  /** invoke(enabled: boolean) → boolean effettivo dopo l'impostazione. */
  setAutostart: 'app:set-autostart',
  /** invoke → apre la cartella dei log nell'esplora file. */
  openLogs: 'app:open-logs',
  /** invoke → info per prefillare la schermata di abbinamento. */
  getPairingInfo: 'pairing:get-info',
  /** invoke({ animeunionUrl, code }) → esito del pairing col NAS. */
  pair: 'pairing:pair',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** Dati per prefillare la schermata di abbinamento. */
export interface PairingInfo {
  /** URL di AnimeUnion salvato (lo stesso del browser); vuoto se mai abbinato. */
  animeunionUrl: string;
  /** URL LAN suggerito del worker (IP rilevato + porta); null se non rilevabile. */
  suggestedWorkerUrl: string | null;
}

/** Input di abbinamento inviato dalla GUI al main. */
export interface PairInput {
  animeunionUrl: string;
  code: string;
}

/** Superficie esposta dal preload al renderer via contextBridge (`window.workerApi`). */
export interface WorkerApi {
  getStatus(): Promise<DesktopStatus>;
  restartWorker(): Promise<DesktopStatus>;
  onStatusChanged(listener: (status: DesktopStatus) => void): () => void;
  getAutostart(): Promise<boolean>;
  setAutostart(enabled: boolean): Promise<boolean>;
  openLogs(): Promise<void>;
  getPairingInfo(): Promise<PairingInfo>;
  pair(input: PairInput): Promise<PairOutcome>;
}
