import { HomeView } from '@/components/home/home-view';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AnimeUnion Docker',
};

export default function HomePage() {
  return <HomeView />;
}
