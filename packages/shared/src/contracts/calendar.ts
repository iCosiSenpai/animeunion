import { z } from 'zod';
import { animeSummarySchema } from './anime';

export const weekDaySchema = z.enum([
  'LUNEDI',
  'MARTEDI',
  'MERCOLEDI',
  'GIOVEDI',
  'VENERDI',
  'SABATO',
  'DOMENICA',
]);
export type WeekDay = z.infer<typeof weekDaySchema>;

export const calendarEntrySchema = z.object({
  day: weekDaySchema,
  date: z.string(),
  anime: z.array(animeSummarySchema),
});
export type CalendarEntry = z.infer<typeof calendarEntrySchema>;

export const calendarWeekSchema = z.array(calendarEntrySchema);
export type CalendarWeek = z.infer<typeof calendarWeekSchema>;
