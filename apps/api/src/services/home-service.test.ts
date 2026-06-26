import type { AnimeSource, FeaturedAnime } from '@animeunion/shared';
import { describe, expect, it } from 'vitest';
import { testLogger } from '../test/helpers';
import { createHomeService } from './home-service';

function featuredItem(partial: Partial<FeaturedAnime> & { slug: string }): FeaturedAnime {
  return {
    id: partial.slug,
    title: 'Test',
    titleIta: null,
    coverImage: 'https://cdn.test/cover.jpg',
    type: 'TV',
    status: 'ONGOING',
    season: null,
    seasonYear: 2026,
    score: null,
    genres: [],
    availableLanguages: ['SUB_ITA'],
    seriesId: null,
    seasonNumber: null,
    bannerImage: null,
    ...partial,
  };
}

describe('HomeService.featured', () => {
  it('arricchisce il banner dal lookup DB quando il live non lo espone', async () => {
    const source = {
      getFeatured: async () => [featuredItem({ slug: 'a' }), featuredItem({ slug: 'b' })],
    } as unknown as AnimeSource;
    const bannerLookup = (slugs: string[]) =>
      new Map(slugs.map((slug) => [slug, slug === 'a' ? 'https://cdn.test/banner-a.jpg' : null]));
    const service = createHomeService({ source, logger: testLogger, bannerLookup });

    const result = await service.featured();

    expect(result.find((item) => item.slug === 'a')?.bannerImage).toBe(
      'https://cdn.test/banner-a.jpg',
    );
    expect(result.find((item) => item.slug === 'b')?.bannerImage).toBeNull();
  });

  it('il banner live ha precedenza sul DB; il lookup riceve solo gli slug senza banner', async () => {
    const source = {
      getFeatured: async () => [
        featuredItem({ slug: 'a', bannerImage: 'https://live.test/banner-a.jpg' }),
        featuredItem({ slug: 'b' }),
      ],
    } as unknown as AnimeSource;
    let askedFor: string[] = [];
    const bannerLookup = (slugs: string[]) => {
      askedFor = slugs;
      return new Map(slugs.map((slug) => [slug, 'https://db.test/banner.jpg']));
    };
    const service = createHomeService({ source, logger: testLogger, bannerLookup });

    const result = await service.featured();

    expect(result.find((item) => item.slug === 'a')?.bannerImage).toBe(
      'https://live.test/banner-a.jpg',
    );
    expect(result.find((item) => item.slug === 'b')?.bannerImage).toBe(
      'https://db.test/banner.jpg',
    );
    expect(askedFor).toEqual(['b']);
  });

  it('senza bannerLookup ritorna i featured con banner null (nessun crash)', async () => {
    const source = {
      getFeatured: async () => [featuredItem({ slug: 'a' })],
    } as unknown as AnimeSource;
    const service = createHomeService({ source, logger: testLogger });

    const result = await service.featured();

    expect(result[0]?.bannerImage).toBeNull();
  });
});
