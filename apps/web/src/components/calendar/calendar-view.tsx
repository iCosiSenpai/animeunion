'use client';

import { AnimeGrid, AnimeGridSkeleton } from '@/components/anime/anime-grid';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';
import type { WeekDay } from '@animeunion/shared';

const DAYS: { value: WeekDay; label: string }[] = [
  { value: 'LUNEDI', label: 'Lun' },
  { value: 'MARTEDI', label: 'Mar' },
  { value: 'MERCOLEDI', label: 'Mer' },
  { value: 'GIOVEDI', label: 'Gio' },
  { value: 'VENERDI', label: 'Ven' },
  { value: 'SABATO', label: 'Sab' },
  { value: 'DOMENICA', label: 'Dom' },
];

const JS_DAY_TO_WEEKDAY: WeekDay[] = [
  'DOMENICA',
  'LUNEDI',
  'MARTEDI',
  'MERCOLEDI',
  'GIOVEDI',
  'VENERDI',
  'SABATO',
];

export function CalendarView() {
  const { data, isLoading } = trpc.calendar.week.useQuery();
  const today = JS_DAY_TO_WEEKDAY[new Date().getDay()] ?? 'LUNEDI';
  const week = data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Calendario</h1>

      {isLoading ? (
        <AnimeGridSkeleton />
      ) : (
        <Tabs defaultValue={today}>
          <TabsList className="flex-wrap">
            {DAYS.map((day) => (
              <TabsTrigger key={day.value} value={day.value}>
                {day.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {DAYS.map((day) => {
            const entry = week.find((item) => item.day === day.value);
            const items = entry?.anime ?? [];
            return (
              <TabsContent key={day.value} value={day.value} className="mt-4">
                {items.length === 0 ? (
                  <p className="py-16 text-center text-muted-foreground">
                    Nessun anime in uscita in questo giorno.
                  </p>
                ) : (
                  <AnimeGrid anime={items} />
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}
