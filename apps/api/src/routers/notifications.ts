import { notificationSchema } from '@animeunion/shared';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const notificationsRouter = router({
  list: publicProcedure
    .input(z.object({ limit: z.number().int().positive().max(200).optional() }).optional())
    .output(notificationSchema.array())
    .query(({ ctx, input }) => ctx.services.notifications.list(input?.limit)),

  unreadCount: publicProcedure.query(({ ctx }) => ({
    count: ctx.services.notifications.unreadCount(),
  })),

  markAllRead: publicProcedure.mutation(({ ctx }) => ({
    marked: ctx.services.notifications.markAllRead(),
  })),

  clear: publicProcedure.mutation(({ ctx }) => ({
    removed: ctx.services.notifications.clear(),
  })),
});
