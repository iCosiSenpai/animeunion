import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';

/**
 * Config locale dell'app desktop, persistita in `userData/config.json` dal processo main. Il token è
 * generato localmente al primo avvio e condiviso col NAS durante l'enrollment: l'utente non digita
 * più nulla a mano. Qui vive solo la logica pura (generazione token + default), testabile.
 */
export interface AppConfig {
  /** Token Bearer del worker, generato localmente. Condiviso col NAS via enrollment. */
  workerToken: string;
  /** Nome del worker mostrato nel NAS (default: hostname del PC). */
  workerName: string;
  /** Porta di ascolto del worker. */
  port: number;
  /** Interfaccia di ascolto: `0.0.0.0` così il NAS lo raggiunge sulla LAN. */
  host: string;
  /** URL di AnimeUnion (lo stesso del browser), impostato dall'enrollment. Vuoto = non collegato. */
  animeunionUrl: string;
  /** Avvio automatico al login. */
  autostart: boolean;
}

/** Genera un token esadecimale casuale (default 32 byte → 64 hex char). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/** Config di default (token fresco). Gli override permettono di caricare valori persistiti. */
export function createDefaultConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    workerToken: generateToken(),
    workerName: hostname(),
    port: 8787,
    host: '0.0.0.0',
    animeunionUrl: '',
    autostart: true,
    ...overrides,
  };
}
