import cors from '@fastify/cors';
import { type FastifyTRPCPluginOptions, fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import fastify from 'fastify';
import { env } from './config/env';
import { createAppContext } from './context';
import { integrationRoutes } from './integration-routes';
import { logger } from './lib/logger';
import { type AppRouter, appRouter } from './routers';
import { createScheduler, startSchedulerThenListen } from './scheduler';

// Interpreta TRUST_PROXY: 'true'/'false' → booleano, un intero → numero di hop, altrimenti la
// stringa (lista di IP/CIDR passata a Fastify così com'è). Default: false.
function parseTrustProxy(raw: string | undefined): boolean | number | string {
  if (!raw) {
    return false;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  const n = Number(raw);
  return Number.isInteger(n) && String(n) === raw.trim() ? n : raw;
}

async function main(): Promise<void> {
  const ctx = createAppContext();
  const app = fastify({ loggerInstance: logger, trustProxy: parseTrustProxy(env.TRUST_PROXY) });

  // Header di sicurezza su ogni risposta (API JSON: niente sniffing, niente framing).
  app.addHook('onRequest', async (_req, reply) => {
    reply.headers({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'x-dns-prefetch-control': 'off',
    });
  });

  const corsOrigins = env.CORS_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  // Default sicuro: nega gli origin cross-site (same-origin only). Il web server fa da proxy verso
  // l'API, quindi il browser non chiama mai l'API cross-origin. `CORS_ORIGINS=*` riabilita il
  // reflect-all per chi accede all'API direttamente da un altro origin; una lista li restringe.
  const corsOrigin = corsOrigins?.includes('*')
    ? true
    : corsOrigins && corsOrigins.length > 0
      ? corsOrigins
      : false;
  await app.register(cors, { origin: corsOrigin });
  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext: ({ req }) => {
        const header = req.headers['x-app-session'];
        const sessionToken = Array.isArray(header) ? header[0] : header;
        return { ...ctx, sessionToken };
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
  });
  app.get('/health', async () => ({ status: 'ok' }));
  // Rotte REST per integrazioni esterne (richieste stile Seerr), auth via header X-Api-Key.
  await app.register(integrationRoutes(ctx), { prefix: '/api/integration' });

  const scheduler = createScheduler(ctx);

  const shutdown = async (): Promise<void> => {
    scheduler.stop();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await startSchedulerThenListen(scheduler, () =>
    app.listen({ port: env.API_PORT, host: '0.0.0.0' }),
  );
}

// Handler globali: cattura promise rejection e eccezioni non gestite per evitare
// crash silenziosi o crash non loggati. uncaughtException esce con codice 1
// (irrecuperabile); unhandledRejection è solo un warning (la promise è già terminata).
process.on('unhandledRejection', (reason) => {
  logger.warn({ reason }, 'Promise rejection non gestita');
});
process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Eccezione non catturata — uscita forzata');
  process.exit(1);
});

main().catch((error) => {
  logger.error(error, 'Avvio del server fallito');
  process.exit(1);
});
