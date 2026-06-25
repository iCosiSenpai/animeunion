import { pino } from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // Non far mai finire segreti nei log (token/password/header Authorization).
  redact: {
    paths: [
      'token',
      'accessToken',
      'refreshToken',
      'password',
      'access_token',
      'refresh_token',
      'authorization',
      'headers.authorization',
      'req.headers.authorization',
      'request.headers.authorization',
      // Chiave API delle richieste in ingresso (header con trattini → notazione a bracket).
      'headers["x-api-key"]',
      'req.headers["x-api-key"]',
      'request.headers["x-api-key"]',
      // URL di download firmati (scadono, ma non devono comparire nei log).
      'downloadUrl',
      'sourceUrl',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.password',
      '*.downloadUrl',
      '*.sourceUrl',
    ],
    censor: '[redacted]',
  },
});

export type Logger = typeof logger;
