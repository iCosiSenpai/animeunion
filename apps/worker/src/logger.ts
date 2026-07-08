import { pino } from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // Mai loggare il token del worker (header Authorization).
  redact: {
    paths: [
      'authorization',
      'headers.authorization',
      'req.headers.authorization',
      'request.headers.authorization',
    ],
    censor: '[redacted]',
  },
});

export type Logger = typeof logger;
