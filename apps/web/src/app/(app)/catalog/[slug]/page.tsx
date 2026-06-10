import { AnimeDetail } from '@/components/catalog/anime-detail';

export default async function AnimeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <AnimeDetail slug={slug} />;
}
