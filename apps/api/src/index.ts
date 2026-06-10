import cors from '@fastify/cors';
import { type FastifyTRPCPluginOptions, fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import fastify from 'fastify';
import { env } from './config/env';
import { createAppContext } from './context';
import { logger } from './lib/logger';
import { type AppRouter, appRouter } from './routers';

async function main(): Promise<void> {
  const ctx = createAppContext();
  const app = fastify({ loggerInstance: logger });

  await app.register(cors, { origin: true });
  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext: () => ctx,
    } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
  });
  app.get('/health', async () => ({ status: 'ok' }));

  const shutdown = async (): Promise<void> => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
}

main().catch((error) => {
  logger.error(error, 'Avvio del server fallito');
  process.exit(1);
});
