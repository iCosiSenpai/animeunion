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

  markRead: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ({ marked: ctx.services.notifications.markRead(input.id) })),

  markAllRead: publicProcedure.mutation(({ ctx }) => ({
    marked: ctx.services.notifications.markAllRead(),
  })),

  clear: publicProcedure.mutation(({ ctx }) => ({
    removed: ctx.services.notifications.clear(),
  })),

  testTelegram: publicProcedure
    .input(z.object({ botToken: z.string().optional(), chatId: z.string().optional() }).optional())
    .output(z.object({ ok: z.boolean(), error: z.string().optional() }))
    .mutation(({ ctx, input }) => ctx.services.notifications.testTelegram(input)),

  testDiscord: publicProcedure
    .input(z.object({ webhookUrl: z.string().optional() }).optional())
    .output(z.object({ ok: z.boolean(), error: z.string().optional() }))
    .mutation(({ ctx, input }) => ctx.services.notifications.testDiscord(input?.webhookUrl)),
});
