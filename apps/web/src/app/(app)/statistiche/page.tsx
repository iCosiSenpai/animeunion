import { StatsView } from '@/components/stats/stats-view';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Statistiche — AnimeUnion Docker',
};

export default function StatistichePage() {
  return <StatsView />;
}
