import { weekDaySchema } from '@animeunion/shared';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const calendarRouter = router({
  week: publicProcedure.query(({ ctx }) => ctx.services.catalog.getCalendar()),

  day: publicProcedure
    .input(z.object({ day: weekDaySchema }))
    .query(({ ctx, input }) => ctx.services.catalog.getCalendarDay(input.day)),
});
