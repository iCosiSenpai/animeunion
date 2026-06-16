import {
  downloadActionInputSchema,
  downloadAddInputSchema,
  downloadAddMissingInputSchema,
} from '@animeunion/shared';
import { publicProcedure, router } from '../trpc';

export const downloadRouter = router({
  addEpisode: publicProcedure.input(downloadAddInputSchema).mutation(({ ctx, input }) => ({
    queueId: ctx.services.download.addEpisode(input),
  })),

  addMissing: publicProcedure.input(downloadAddMissingInputSchema).mutation(({ ctx, input }) => ({
    enqueued: ctx.services.download.addMissing(input),
  })),

  addAll: publicProcedure.input(downloadAddMissingInputSchema).mutation(({ ctx, input }) => ({
    enqueued: ctx.services.download.addAll(input),
  })),

  queue: publicProcedure.query(({ ctx }) => ctx.services.download.getQueue()),

  cancel: publicProcedure.input(downloadActionInputSchema).mutation(({ ctx, input }) => ({
    cancelled: ctx.services.download.cancel(input.queueId),
  })),

  retry: publicProcedure.input(downloadActionInputSchema).mutation(({ ctx, input }) => ({
    retried: ctx.services.download.retry(input.queueId),
  })),

  clearCompleted: publicProcedure.mutation(({ ctx }) => ({
    removed: ctx.services.download.clearCompleted(),
  })),
});
