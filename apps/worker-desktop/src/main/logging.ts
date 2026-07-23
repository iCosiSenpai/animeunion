import type { Logger } from '@animeunion/worker';
import { multistream, pino } from 'pino';
import type { LogLine } from '../shared/ipc';

/**
 * Logger dell'app con cattura in-memory. È un'istanza pino reale (serve a Fastify come
 * `loggerInstance`) con un multistream: le righe vanno su stdout E in un ring buffer, e ogni riga
 * viene notificata (per il push verso il renderer e la sidebar dei log). Il token è redatto come nel
 * logger del worker.
 */

const MAX_LINES = 500;
const LEVELS: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

export interface CapturingLogger {
  logger: Logger;
  /** Righe di log recenti (backlog). */
  getLines(): LogLine[];
  /** Sottoscrizione alle nuove righe; ritorna la funzione di annullamento. */
  onLine(cb: (line: LogLine) => void): () => void;
}

export function createCapturingLogger(): CapturingLogger {
  const buffer: LogLine[] = [];
  const listeners = new Set<(line: LogLine) => void>();

  // Stream "sink" che riceve le righe pino (JSON+newline), le parsa e le distribuisce.
  const sink = {
    write(chunk: string): void {
      try {
        const obj = JSON.parse(chunk) as { time?: number; level?: number; msg?: string };
        const line: LogLine = {
          time: obj.time ?? Date.now(),
          level: LEVELS[obj.level ?? 30] ?? 'info',
          msg: obj.msg ?? '',
        };
        buffer.push(line);
        if (buffer.length > MAX_LINES) {
          buffer.shift();
        }
        for (const cb of listeners) {
          cb(line);
        }
      } catch {
        // Riga non-JSON (improbabile con pino): ignora.
      }
    },
  };

  const logger = pino(
    {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: {
        paths: [
          'authorization',
          'headers.authorization',
          'req.headers.authorization',
          'request.headers.authorization',
        ],
        censor: '[redacted]',
      },
    },
    multistream([{ stream: process.stdout }, { stream: sink }]),
  ) as unknown as Logger;

  return {
    logger,
    getLines: () => [...buffer],
    onLine: (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
