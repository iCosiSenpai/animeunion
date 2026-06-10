import { FollowsView } from '@/components/follows/follows-view';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Seguiti — AnimeUnion Docker',
};

export default function FollowsPage() {
  return <FollowsView />;
}
