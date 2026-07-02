'use client';

import { AnimeGridSkeleton } from '@/components/anime/anime-grid';
import { CalendarAnimeGrid } from '@/components/calendar/calendar-anime-grid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';
import { useFollowedIds } from '@/lib/use-followed';
import { cn } from '@/lib/utils';
import type { CalendarItem, WeekDay } from '@animeunion/shared';
import { AlertCircle, CalendarDays, Check, Rows3 } from 'lucide-react';
import { useState } from 'react';

const DAYS: { value: WeekDay; short: string; long: string }[] = [
  { value: 'LUNEDI', short: 'Lun', long: 'Lunedì' },
  { value: 'MARTEDI', short: 'Mar', long: 'Martedì' },
  { value: 'MERCOLEDI', short: 'Mer', long: 'Mercoledì' },
  { value: 'GIOVEDI', short: 'Gio', long: 'Giovedì' },
  { value: 'VENERDI', short: 'Ven', long: 'Venerdì' },
  { value: 'SABATO', short: 'Sab', long: 'Sabato' },
  { value: 'DOMENICA', short: 'Dom', long: 'Domenica' },
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

const DATE_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });

// Il feed calendario espone `date: ''` (lo conferma api-source), quindi le date dei giorni si
// calcolano lato client dalla settimana corrente, lunedì-based come l'ordine WEEK del backend.
function weekDates(reference: Date): Map<WeekDay, string> {
  const jsDay = reference.getDay(); // 0=Dom..6=Sab
  const offsetToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(reference);
  monday.setDate(reference.getDate() + offsetToMonday);
  const map = new Map<WeekDay, string>();
  DAYS.forEach((day, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    map.set(day.value, DATE_FMT.format(date));
  });
  return map;
}

export function CalendarView() {
  const { data, isLoading, isError, refetch } = trpc.calendar.week.useQuery();
  const followedIds = useFollowedIds();
  const [view, setView] = useState<'day' | 'week'>('day');
  const [onlyFollowed, setOnlyFollowed] = useState(false);

  const now = new Date();
  const today = JS_DAY_TO_WEEKDAY[now.getDay()] ?? 'LUNEDI';
  const dates = weekDates(now);
  const week = data ?? [];

  const itemsForDay = (day: WeekDay): CalendarItem[] => {
    const items = week.find((entry) => entry.day === day)?.anime ?? [];
    const filtered = onlyFollowed ? items.filter((anime) => followedIds.has(anime.id)) : items;
    // Ordina per orario di uscita (le voci senza airTime in coda): il calendario segue la giornata.
    return [...filtered].sort((a, b) => (a.airTime ?? '99:99').localeCompare(b.airTime ?? '99:99'));
  };

  const emptyText = onlyFollowed
    ? 'Nessun seguito in uscita in questo giorno.'
    : 'Nessun anime in uscita in questo giorno.';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Programmazione"
        title="Calendario"
        description="Quando escono i nuovi episodi degli anime in corso, giorno per giorno."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-md border border-border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={view === 'day' ? 'default' : 'ghost'}
            aria-pressed={view === 'day'}
            onClick={() => setView('day')}
          >
            <CalendarDays className="h-4 w-4" />
            Per giorno
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === 'week' ? 'default' : 'ghost'}
            aria-pressed={view === 'week'}
            onClick={() => setView('week')}
          >
            <Rows3 className="h-4 w-4" />
            Settimana
          </Button>
        </div>
        <Button
          type="button"
          size="sm"
          variant={onlyFollowed ? 'default' : 'outline'}
          aria-pressed={onlyFollowed}
          onClick={() => setOnlyFollowed((value) => !value)}
          className="ml-auto"
        >
          <Check className="h-4 w-4" />
          Solo i miei seguiti
        </Button>
      </div>

      {isLoading ? (
        <AnimeGridSkeleton />
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Impossibile caricare il calendario"
          description="Controlla la connessione e riprova."
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Riprova
            </Button>
          }
        />
      ) : view === 'day' ? (
        <Tabs defaultValue={today}>
          <TabsList className="h-auto flex-wrap gap-1">
            {DAYS.map((day) => (
              <TabsTrigger
                key={day.value}
                value={day.value}
                className={cn(
                  'flex-col gap-0.5 py-1.5',
                  day.value === today && 'data-[state=inactive]:text-primary',
                )}
              >
                <span className="flex items-center gap-1">
                  {day.short}
                  {day.value === today ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                  ) : null}
                </span>
                <span className="text-[10px] font-normal opacity-70">{dates.get(day.value)}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {DAYS.map((day) => {
            const items = itemsForDay(day.value);
            return (
              <TabsContent key={day.value} value={day.value} className="mt-4">
                {items.length === 0 ? (
                  <p className="py-16 text-center text-muted-foreground">{emptyText}</p>
                ) : (
                  <CalendarAnimeGrid items={items} />
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      ) : (
        <div className="space-y-8">
          {DAYS.map((day) => {
            const items = itemsForDay(day.value);
            const isToday = day.value === today;
            return (
              <section
                key={day.value}
                className={cn(
                  'rounded-lg border border-transparent',
                  isToday && 'border-primary/40 bg-primary/5 p-4',
                )}
              >
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{day.long}</h2>
                  <span className="text-sm text-muted-foreground">{dates.get(day.value)}</span>
                  {isToday ? <Badge>Oggi</Badge> : null}
                  {items.length > 0 ? (
                    <span className="ml-auto text-sm text-muted-foreground">
                      {items.length} anime
                    </span>
                  ) : null}
                </div>
                {items.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
                ) : (
                  <CalendarAnimeGrid items={items} />
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
