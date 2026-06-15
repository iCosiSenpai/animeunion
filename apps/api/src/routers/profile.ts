import { userProfileSchema } from '@animeunion/shared';
import { publicProcedure, router } from '../trpc';

export const profileRouter = router({
  me: publicProcedure
    .output(userProfileSchema.nullable())
    .query(({ ctx }) => ctx.services.profile.getMe()),
});
