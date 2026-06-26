import {
  pushPublicKeySchema,
  pushSubscriptionInputSchema,
  pushUnsubscribeInputSchema,
} from '@animeunion/shared';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

/** Web Push del browser: chiave pubblica VAPID + gestione sottoscrizioni. */
export const pushRouter = router({
  publicKey: publicProcedure
    .output(pushPublicKeySchema)
    .query(({ ctx }) => ({ publicKey: ctx.services.push.getPublicKey() })),

  subscribe: publicProcedure.input(pushSubscriptionInputSchema).mutation(({ ctx, input }) => {
    ctx.services.push.subscribe(input);
    return { ok: true };
  }),

  unsubscribe: publicProcedure.input(pushUnsubscribeInputSchema).mutation(({ ctx, input }) => {
    ctx.services.push.unsubscribe(input.endpoint);
    return { ok: true };
  }),

  // Invio di prova: spinge una notifica demo a tutte le sottoscrizioni di questo server.
  test: publicProcedure
    .output(z.object({ ok: z.boolean(), sent: z.number() }))
    .mutation(({ ctx }) => ctx.services.push.test()),
});
