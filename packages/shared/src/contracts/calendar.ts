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

// Una voce del calendario è un anime + i dati dell'uscita (orario e numero episodio in arrivo),
// esposti dall'API dopo il potenziamento admin (2026-07). Estende AnimeSummary così ogni consumer
// che si aspetta un AnimeSummary continua a funzionare (un CalendarItem è assegnabile ad AnimeSummary).
export const calendarItemSchema = animeSummarySchema.extend({
  airTime: z.string().nullable(),
  episodeNumber: z.number().int().nullable(),
});
export type CalendarItem = z.infer<typeof calendarItemSchema>;

export const calendarEntrySchema = z.object({
  day: weekDaySchema,
  date: z.string(),
  anime: z.array(calendarItemSchema),
});
export type CalendarEntry = z.infer<typeof calendarEntrySchema>;

export const calendarWeekSchema = z.array(calendarEntrySchema);
export type CalendarWeek = z.infer<typeof calendarWeekSchema>;
