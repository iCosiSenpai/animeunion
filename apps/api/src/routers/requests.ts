import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

// Router per la web UI (Impostazioni): gestisce la chiave dell'API di richiesta in ingresso.
// La chiave in chiaro viene mostrata UNA sola volta (alla generazione): a riposo c'e solo l'hash.
export const requestsRouter = router({
  status: publicProcedure
    .output(z.object({ configured: z.boolean() }))
    .query(({ ctx }) => ({ configured: ctx.services.requestAuth.isConfigured() })),

  generateKey: publicProcedure
    .output(z.object({ key: z.string() }))
    .mutation(({ ctx }) => ctx.services.requestAuth.generateKey()),

  revoke: publicProcedure.output(z.object({ ok: z.boolean() })).mutation(({ ctx }) => {
    ctx.services.requestAuth.revoke();
    return { ok: true };
  }),
});
