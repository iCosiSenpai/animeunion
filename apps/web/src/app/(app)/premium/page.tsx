import { PremiumView } from '@/components/premium/premium-view';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Premium — AnimeUnion Docker',
};

export default function PremiumPage() {
  return <PremiumView />;
}
