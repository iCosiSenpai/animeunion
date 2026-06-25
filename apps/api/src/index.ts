import cors from '@fastify/cors';
import { type FastifyTRPCPluginOptions, fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import fastify from 'fastify';
import { env } from './config/env';
import { createAppContext } from './context';
import { integrationRoutes } from './integration-routes';
import { logger } from './lib/logger';
import { type AppRouter, appRouter } from './routers';
import { createScheduler } from './scheduler';

async function main(): Promise<void> {
  const ctx = createAppContext();
  const app = fastify({ loggerInstance: logger });

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
  await app.register(cors, {
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true,
  });
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

  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  scheduler.start();
}

main().catch((error) => {
  logger.error(error, 'Avvio del server fallito');
  process.exit(1);
});
