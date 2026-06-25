import { requestInputSchema } from '@animeunion/shared';
import type { FastifyPluginAsync } from 'fastify';
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
      // Lo skeleton si ferma qui: la risoluzione + follow/download arrivano nello Step 3.
      await reply.code(501).send({ error: 'not_implemented' });
    });
  };
}
