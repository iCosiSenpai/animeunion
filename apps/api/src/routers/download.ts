import {
  downloadActionInputSchema,
  downloadAddAllBySlugInputSchema,
  downloadAddByRefInputSchema,
  downloadAddInputSchema,
  downloadAddMissingInputSchema,
  downloadGroupActionInputSchema,
  downloadGroupItemsInputSchema,
  downloadSetPriorityInputSchema,
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

  addAllBySlug: publicProcedure
    .input(downloadAddAllBySlugInputSchema)
    .mutation(async ({ ctx, input }) => ({
      enqueued: await ctx.services.download.addAllBySlug(input),
    })),

  queue: publicProcedure.query(({ ctx }) => ctx.services.download.getQueue()),

  // Riassunto aggregato per la coda gigante: gruppi (un anime) + conteggi globali, payload bounded.
  summary: publicProcedure.query(({ ctx }) => ctx.services.download.getQueueSummary()),

  // Righe di un singolo gruppo, paginate (espansione card on-demand).
  groupItems: publicProcedure
    .input(downloadGroupItemsInputSchema)
    .query(({ ctx, input }) => ctx.services.download.getQueueGroupItems(input)),

  cancel: publicProcedure.input(downloadActionInputSchema).mutation(({ ctx, input }) => ({
    cancelled: ctx.services.download.cancel(input.queueId),
  })),

  cancelGroup: publicProcedure.input(downloadGroupActionInputSchema).mutation(({ ctx, input }) => ({
    cancelled: ctx.services.download.cancelGroup(input.animeId),
  })),

  retryGroup: publicProcedure.input(downloadGroupActionInputSchema).mutation(({ ctx, input }) => ({
    retried: ctx.services.download.retryGroup(input.animeId),
  })),

  retry: publicProcedure.input(downloadActionInputSchema).mutation(({ ctx, input }) => ({
    retried: ctx.services.download.retry(input.queueId),
  })),

  setPriority: publicProcedure.input(downloadSetPriorityInputSchema).mutation(({ ctx, input }) => ({
    ok: ctx.services.download.setPriority(input.queueId, input.priority),
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
