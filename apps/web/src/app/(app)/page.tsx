import { DashboardView } from '@/components/dashboard/dashboard-view';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Centro di controllo · AnimeUnion',
};

export default function HomePage() {
  return <DashboardView />;
}
