import {
  pushPublicKeySchema,
  pushSubscriptionInputSchema,
  pushUnsubscribeInputSchema,
} from '@animeunion/shared';
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
});
