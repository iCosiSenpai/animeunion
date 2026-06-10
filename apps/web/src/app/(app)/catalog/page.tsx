import { AnimeGridSkeleton } from '@/components/anime/anime-grid';
import { CatalogBrowser } from '@/components/catalog/catalog-browser';
import type { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Catalogo — AnimeUnion Docker',
};

export default function CatalogPage() {
  return (
    <Suspense fallback={<AnimeGridSkeleton />}>
      <CatalogBrowser />
    </Suspense>
  );
}
