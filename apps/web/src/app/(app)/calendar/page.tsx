import { CalendarView } from '@/components/calendar/calendar-view';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Calendario — AnimeUnion Docker',
};

export default function CalendarPage() {
  return <CalendarView />;
}
