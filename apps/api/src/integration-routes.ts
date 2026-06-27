import { requestInputSchema } from '@animeunion/shared';
import type { FastifyPluginAsync } from 'fastify';
import { NotFoundError, PreconditionError } from './lib/errors';
import type { Context } from './trpc';

// Limite anti-abuso per IP (anche prima dell'auth, così protegge dal brute-force sulla chiave e da
// un servizio esterno mal configurato che martella l'endpoint). Finestra fissa in memoria.
export const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

// Plugin Fastify per le integrazioni esterne (es. richieste stile Seerr), FUORI da tRPC perche il
// chiamante e un servizio esterno. Auth con header X-Api-Key (vedi request-auth-service). La Regola
// #2 ("tRPC e la legge") vale per il frontend: queste rotte sono per i servizi terzi.
//
// Si registra con `app.register(integrationRoutes(ctx), { prefix: '/api/integration' })`: l'auth e
// incapsulata nel plugin, quindi vale solo per queste rotte e non per tRPC ne per /health.
export function integrationRoutes(ctx: Context): FastifyPluginAsync {
  return async (instance) => {
    // Stato del rate-limit per registrazione del plugin (in produzione = vita dell'app).
    const hits = new Map<string, { count: number; resetAt: number }>();

    instance.addHook('onRequest', async (req, reply) => {
      const now = Date.now();
      const ip = req.ip || 'unknown';
      let entry = hits.get(ip);
      if (!entry || now >= entry.resetAt) {
        // Sweep difensivo per non far crescere la mappa all'infinito (in pratica pochi IP).
        if (hits.size > 5000) {
          for (const [k, v] of hits) {
            if (now >= v.resetAt) {
              hits.delete(k);
            }
          }
        }
        entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
        hits.set(ip, entry);
      }
      entry.count += 1;
      if (entry.count > RATE_LIMIT_MAX) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        reply.header('Retry-After', String(retryAfter));
        await reply.code(429).send({ error: 'rate_limited', retryAfter });
        return reply;
      }
    });

    instance.addHook('preHandler', async (req, reply) => {
      const header = req.headers['x-api-key'];
      const key = Array.isArray(header) ? header[0] : header;
      if (!ctx.services.requestAuth.verifyKey(key)) {
        await reply.code(401).send({ error: 'unauthorized' });
        return reply;
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
