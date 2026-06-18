import {
  downloadActionInputSchema,
  downloadAddByRefInputSchema,
  downloadAddInputSchema,
  downloadAddMissingInputSchema,
} from '@animeunion/shared';
import { publicProcedure, router } from '../trpc';

export const downloadRouter = router({
  addEpisode: publicProcedure.input(downloadAddInputSchema).mutation(({ ctx, input }) => ({
    queueId: ctx.services.download.addEpisode(input),
  })),

  addEpisodeRef: publicProcedure
    .input(downloadAddByRefInputSchema)
    .mutation(async ({ ctx, input }) => ({
      queueId: await ctx.services.download.addEpisodeByRef(input),
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

  cancelAll: publicProcedure.mutation(({ ctx }) => ({
    cancelled: ctx.services.download.cancelAll(),
  })),

  retryAllFailed: publicProcedure.mutation(({ ctx }) => ({
    retried: ctx.services.download.retryAllFailed(),
  })),

  pauseQueue: publicProcedure.mutation(({ ctx }) => ({
    paused: ctx.services.download.pauseQueue(),
  })),

  resumeQueue: publicProcedure.mutation(({ ctx }) => ({
    paused: ctx.services.download.resumeQueue(),
  })),

  isPaused: publicProcedure.query(({ ctx }) => ({
    paused: ctx.services.download.isQueuePaused(),
  })),
});
