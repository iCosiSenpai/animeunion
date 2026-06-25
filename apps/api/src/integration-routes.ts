import { requestInputSchema } from '@animeunion/shared';
import type { FastifyPluginAsync } from 'fastify';
import { NotFoundError, PreconditionError } from './lib/errors';
import type { Context } from './trpc';

// Plugin Fastify per le integrazioni esterne (es. richieste stile Seerr), FUORI da tRPC perche il
// chiamante e un servizio esterno. Auth con header X-Api-Key (vedi request-auth-service). La Regola
// #2 ("tRPC e la legge") vale per il frontend: queste rotte sono per i servizi terzi.
//
// Si registra con `app.register(integrationRoutes(ctx), { prefix: '/api/integration' })`: l'auth e
// incapsulata nel plugin, quindi vale solo per queste rotte e non per tRPC ne per /health.
export function integrationRoutes(ctx: Context): FastifyPluginAsync {
  return async (instance) => {
    instance.addHook('preHandler', async (req, reply) => {
      const header = req.headers['x-api-key'];
      const key = Array.isArray(header) ? header[0] : header;
      if (!ctx.services.requestAuth.verifyKey(key)) {
        await reply.code(401).send({ error: 'unauthorized' });
      }
    });

    instance.post('/requests', async (req, reply) => {
      const parsed = requestInputSchema.safeParse(req.body);
      if (!parsed.success) {
        await reply.code(400).send({ error: 'invalid_request', issues: parsed.error.issues });
        return;
      }
      try {
        const result = await ctx.services.requests.handle(parsed.data);
        await reply.code(200).send(result);
      } catch (err) {
        if (err instanceof NotFoundError) {
          await reply.code(404).send({ error: 'not_found', message: err.message });
          return;
        }
        if (err instanceof PreconditionError) {
          await reply.code(412).send({ error: 'precondition_failed', message: err.message });
          return;
        }
        ctx.logger.error({ err }, 'Richiesta in ingresso fallita');
        await reply.code(500).send({ error: 'internal_error' });
      }
    });

    instance.get('/anime/:slug/status', async (req, reply) => {
      const { slug } = req.params as { slug: string };
      try {
        await reply.code(200).send(ctx.services.requests.availability(slug));
      } catch (err) {
        if (err instanceof NotFoundError) {
          await reply.code(404).send({ error: 'not_found', message: err.message });
          return;
        }
        ctx.logger.error({ err }, 'Stato richiesta fallito');
        await reply.code(500).send({ error: 'internal_error' });
      }
    });
  };
}
