/**
 * Limitatore di banda CONDIVISO tra tutti i download in corso: il tetto è aggregato (la somma di
 * tutti i trasferimenti paralleli non supera il limite), non per-download. È pensato per chi ha
 * poca banda disponibile e usa i download simultanei del Premium.
 *
 * Implementazione: token-bucket a "scheduling virtuale". Ogni `take(bytes)` prenota una fetta di
 * tempo (`bytes / rate`) su una timeline condivisa `nextAvailableTs`; chi arriva quando la timeline
 * è nel futuro attende fino al proprio slot. Essendo single-thread JS, l'aggiornamento di
 * `nextAvailableTs` è atomico tra i chiamanti concorrenti, quindi il rate risultante è quello
 * aggregato. La velocità viene riletta con cache (default 1s) così un cambio di config si applica
 * ai download GIÀ in corso senza leggere il DB a ogni chunk.
 *
 * `rate <= 0` = illimitato: `take` è un no-op (nessun overhead quando la feature è spenta).
 */

export interface BandwidthLimiter {
  /**
   * Attende finché lo scheduler consente di consumare `bytes`. Risolve subito se il limite è 0
   * (illimitato) o se il segnale è già abortito. Non rigetta mai (l'abort è gestito dal chiamante).
   */
  take(bytes: number, signal?: AbortSignal): Promise<void>;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal?.aborted) {
      resolve();
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    // Non tenere vivo l'event loop solo per il throttle.
    timer.unref?.();
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function createBandwidthLimiter(
  /** Ritorna il limite corrente in BYTE/secondo. <= 0 = illimitato. */
  resolveBytesPerSec: () => number,
  options: { rateTtlMs?: number; now?: () => number } = {},
): BandwidthLimiter {
  const rateTtlMs = options.rateTtlMs ?? 1_000;
  const now = options.now ?? Date.now;

  const readRate = (): number => {
    const value = resolveBytesPerSec();
    return Number.isFinite(value) && value > 0 ? value : 0;
  };

  let cachedRate = readRate();
  let lastRateTs = now();
  // Timeline virtuale condivisa: "il prossimo byte non può partire prima di questo istante".
  let nextAvailableTs = now();

  function currentRate(): number {
    const ts = now();
    if (ts - lastRateTs >= rateTtlMs) {
      cachedRate = readRate();
      lastRateTs = ts;
    }
    return cachedRate;
  }

  return {
    async take(bytes: number, signal?: AbortSignal): Promise<void> {
      const rate = currentRate();
      if (rate <= 0 || bytes <= 0) {
        // Illimitato: mantieni la timeline al presente così, riattivando un limite, non si accumula
        // un "credito" che sfocerebbe in un burst iniziale.
        nextAvailableTs = now();
        return;
      }
      const ts = now();
      const base = Math.max(ts, nextAvailableTs);
      // Prenota la fetta di tempo per questi byte sulla timeline condivisa.
      nextAvailableTs = base + (bytes / rate) * 1_000;
      const waitMs = base - ts;
      if (waitMs > 0) {
        await sleep(waitMs, signal);
      }
    },
  };
}
