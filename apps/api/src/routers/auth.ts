import {
  authLoginInputSchema,
  authStatusSchema,
  socialPollOutputSchema,
  socialStartInputSchema,
  socialStartOutputSchema,
} from '@animeunion/shared';
import { publicProcedure, router } from '../trpc';

export const authRouter = router({
  status: publicProcedure.output(authStatusSchema).query(async ({ ctx }) => {
    try {
      await ctx.services.auth.getToken();
    } catch (error) {
      ctx.logger.warn({ err: error }, 'Auto-login in auth.status fallito');
    }
    return ctx.services.auth.status();
  }),

  login: publicProcedure
    .input(authLoginInputSchema)
    .output(authStatusSchema)
    .mutation(({ ctx, input }) =>
      ctx.services.auth.loginWithCredentials(input.email, input.password),
    ),

  socialStart: publicProcedure
    .input(socialStartInputSchema)
    .output(socialStartOutputSchema)
    .mutation(({ ctx, input }) => ctx.services.auth.socialStart(input.provider)),

  socialPoll: publicProcedure
    .output(socialPollOutputSchema)
    .mutation(({ ctx }) => ctx.services.auth.socialPoll()),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.services.auth.logout();
    return { ok: true };
  }),
});
