import { existsSync } from 'node:fs';
import { probeCapabilities } from '@animeunion/neural-core';
import type { NeuralWorkerCapabilities } from '@animeunion/shared';

/**
 * Risoluzione dell'eseguibile ffmpeg e traduzione del feature-detect (`probeCapabilities`) in una
 * readiness leggibile dall'utente. Logica pura e iniettabile: l'app desktop passa il binario ffmpeg
 * imbarcato come candidato, la CLI/doctor usano `WORKER_FFMPEG_PATH` o il PATH di sistema.
 */

export interface ResolveFfmpegOptions {
  /** Override esplicito (es. `WORKER_FFMPEG_PATH`). Se valorizzato, vince sempre. */
  override?: string | null;
  /** Candidati in ordine di preferenza (es. il binario ffmpeg imbarcato nell'app). */
  candidates?: readonly string[];
  /** Predicato di esistenza file, iniettabile per i test. Default: `existsSync`. */
  exists?: (path: string) => boolean;
  /** Fallback finale se nulla esiste. Default: `'ffmpeg'` (dal PATH). */
  fallback?: string;
}

/**
 * Sceglie il path ffmpeg: override esplicito → primo candidato esistente → fallback (`ffmpeg`).
 * L'override viene restituito così com'è anche se non esiste: se l'utente lo imposta, lo rispettiamo
 * e sarà il probe a segnalare l'eventuale incapacità.
 */
export function resolveFfmpegPath(opts: ResolveFfmpegOptions = {}): string {
  const exists = opts.exists ?? existsSync;
  const fallback = opts.fallback ?? 'ffmpeg';
  const override = opts.override?.trim();
  if (override) {
    return override;
  }
  for (const candidate of opts.candidates ?? []) {
    if (candidate && exists(candidate)) {
      return candidate;
    }
  }
  return fallback;
}

export type ReadinessLevel = 'ok' | 'error';

export interface FfmpegReadiness {
  /** Vero solo se il worker può davvero renderizzare (ffmpeg + libplacebo + Vulkan). */
  ok: boolean;
  level: ReadinessLevel;
  /** Messaggio breve di stato (una riga). */
  title: string;
  /** Suggerimento operativo se qualcosa manca; `null` quando è tutto a posto. */
  hint: string | null;
}

/**
 * Traduce le capacità rilevate in una readiness umana. L'ordine dei controlli va dal problema più a
 * monte (ffmpeg assente) a quello più a valle (GPU senza Vulkan), così il messaggio indica la vera
 * causa radice.
 */
export function describeReadiness(caps: NeuralWorkerCapabilities): FfmpegReadiness {
  if (!caps.ffmpegCapable) {
    return {
      ok: false,
      level: 'error',
      title: 'ffmpeg non trovato o non eseguibile',
      hint: "L'app include ffmpeg: prova a reinstallarla. Se usi un ffmpeg di sistema, verifica che sia nel PATH.",
    };
  }
  if (!caps.hasLibplacebo) {
    return {
      ok: false,
      level: 'error',
      title: 'ffmpeg senza il filtro libplacebo',
      hint: "Serve una build ffmpeg con --enable-libplacebo. L'app ne include una compatibile: reinstallala o non sovrascrivere il path ffmpeg.",
    };
  }
  if (!caps.hasVulkan) {
    return {
      ok: false,
      level: 'error',
      title: 'GPU Vulkan non disponibile',
      hint: 'Aggiorna i driver della scheda video. Serve una GPU con supporto Vulkan (richiesto dagli shader Anime4K/libplacebo).',
    };
  }
  return {
    ok: true,
    level: 'ok',
    title: 'Pronto per l’upscale (ffmpeg + libplacebo + Vulkan)',
    hint: null,
  };
}

export interface FfmpegEvaluation {
  ffmpegBin: string;
  capabilities: NeuralWorkerCapabilities;
  readiness: FfmpegReadiness;
}

/** Esegue il probe sul binario indicato e ne mappa la readiness. */
export async function evaluateFfmpeg(
  ffmpegBin: string,
  probeImpl: typeof probeCapabilities = probeCapabilities,
): Promise<FfmpegEvaluation> {
  const capabilities = await probeImpl(ffmpegBin);
  return { ffmpegBin, capabilities, readiness: describeReadiness(capabilities) };
}
