import {
  lockDisableInputSchema,
  lockSetPasscodeInputSchema,
  lockStatusSchema,
  lockTokenResultSchema,
  lockUnlockInputSchema,
} from '@animeunion/shared';
import { z } from 'zod';
import { openProcedure, publicProcedure, router } from '../trpc';

/** Blocco web UI con passcode. status/unlock sono "open" (raggiungibili da bloccato). */
export const lockRouter = router({
  status: openProcedure
    .output(lockStatusSchema)
    .query(({ ctx }) => ctx.services.lock.status(ctx.sessionToken)),

  unlock: openProcedure
    .input(lockUnlockInputSchema)
    .output(lockTokenResultSchema)
    .mutation(({ ctx, input }) => ctx.services.lock.unlock(input.passcode)),

  setPasscode: publicProcedure
    .input(lockSetPasscodeInputSchema)
    .output(z.object({ token: z.string() }))
    .mutation(({ ctx, input }) => ctx.services.lock.setPasscode(input.next, input.current)),

  disable: publicProcedure.input(lockDisableInputSchema).mutation(({ ctx, input }) => {
    ctx.services.lock.disable(input.current);
    return { ok: true };
  }),
});
