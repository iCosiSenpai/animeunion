import type { DesktopStatus } from './status';

/**
 * Contratto IPC tra processo main (Electron) e renderer (React). I nomi dei canali sono costanti
 * condivise per evitare stringhe magiche divergenti tra i due lati. Le API `invoke` sono
 * request/response; `statusChanged` e `logLine` sono eventi push dal main al renderer.
 *
 * NB: questo file è importato sia dal preload/main (Node) sia dal renderer (browser), quindi NON
 * deve importare moduli Node o `@animeunion/worker`. I DTO sono ridefiniti qui come tipi puri.
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
  /** invoke → righe di log recenti (backlog per la sidebar). */
  getLogs: 'logs:get',
  /** evento main→renderer: nuova riga di log. */
  logLine: 'logs:line',
  /** invoke → info per il pannello di connessione (IP LAN, nome, URL suggerito). */
  getConnectionInfo: 'conn:get-info',
  /** invoke → scansiona la LAN e restituisce gli URL dei NAS AnimeUnion trovati. */
  discoverNas: 'conn:discover',
  /** invoke({ animeunionUrl }) → collega il worker al NAS (enrollment). */
  enroll: 'conn:enroll',
  /** invoke → esegue un test reale della GPU (Vulkan + libplacebo). */
  gpuTest: 'gpu:test',
  /** invoke → aggiunge la regola Windows Firewall per la porta del worker (prompt UAC). */
  allowFirewall: 'net:allow-firewall',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** Info per il pannello di connessione della GUI. */
export interface ConnectionInfo {
  /** URL di AnimeUnion salvato (lo stesso del browser); vuoto se mai collegato. */
  animeunionUrl: string;
  /** Nome del worker (hostname del PC), mostrato nel NAS. */
  workerName: string;
  /** IP LAN rilevato del PC; null se non rilevabile. */
  lanIp: string | null;
  /** URL LAN del worker (IP + porta); null se l'IP non è rilevabile. */
  workerUrl: string | null;
  /** Porta di ascolto del worker. */
  port: number;
  /** True su Windows: la GUI mostra il pulsante "Consenti sulla rete" (firewall). */
  needsFirewallHint: boolean;
}

/** Input di enrollment inviato dalla GUI al main. */
export interface EnrollInput {
  animeunionUrl: string;
}

/** Esito dell'enrollment riportato alla GUI. */
export interface EnrollOutcome {
  ok: boolean;
  reachable: boolean;
  ffmpegCapable: boolean;
  message: string | null;
}

/** Esito del test GPU (rispecchia GpuSelfTestResult del worker, senza dipendenza Node). */
export interface GpuTestResult {
  ok: boolean;
  durationMs: number;
  message: string;
  logTail: string;
}

/** Esito dell'aggiunta della regola firewall. */
export interface FirewallResult {
  ok: boolean;
  message: string;
}

/** Una riga di log per la sidebar. */
export interface LogLine {
  time: number;
  level: string;
  msg: string;
}

/** Superficie esposta dal preload al renderer via contextBridge (`window.workerApi`). */
export interface WorkerApi {
  getStatus(): Promise<DesktopStatus>;
  restartWorker(): Promise<DesktopStatus>;
  onStatusChanged(listener: (status: DesktopStatus) => void): () => void;
  getAutostart(): Promise<boolean>;
  setAutostart(enabled: boolean): Promise<boolean>;
  openLogs(): Promise<void>;
  getLogs(): Promise<LogLine[]>;
  onLog(listener: (line: LogLine) => void): () => void;
  getConnectionInfo(): Promise<ConnectionInfo>;
  discoverNas(): Promise<string[]>;
  enroll(input: EnrollInput): Promise<EnrollOutcome>;
  gpuTest(): Promise<GpuTestResult>;
  allowFirewall(): Promise<FirewallResult>;
}
