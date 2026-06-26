import type { AnimeSource, FeaturedAnime, LatestEpisode, NewsItem } from '@animeunion/shared';
import type { Logger } from '../lib/logger';

const TTL_MS = 10 * 60 * 1000;

export interface HomeService {
  latestEpisodes(limit?: number): Promise<LatestEpisode[]>;
  featured(): Promise<FeaturedAnime[]>;
  news(limit?: number): Promise<NewsItem[]>;
}

export interface HomeServiceDeps {
  source: AnimeSource;
  logger: Logger;
  /** Lookup banner ad alta risoluzione dal DB per arricchire la hero (slug → banner|null). */
  bannerLookup?: (slugs: string[]) => Map<string, string | null>;
  now?: () => Date;
}

export function createHomeService(deps: HomeServiceDeps): HomeService {
  const { source, logger, bannerLookup } = deps;
  const now = deps.now ?? (() => new Date());

  // Cache leggera in memoria per evitare di martellare il sito sulle viste della home.
  function cached<T>(label: string) {
    let entry: { fetchedAt: number; value: T } | null = null;
    return async (loader: (() => Promise<T>) | undefined, fallback: T): Promise<T> => {
      if (entry && now().getTime() - entry.fetchedAt < TTL_MS) {
        return entry.value;
      }
      if (!loader) {
        return fallback;
      }
      try {
        const value = await loader();
        entry = { fetchedAt: now().getTime(), value };
        return value;
      } catch (error) {
        logger.debug({ err: error }, `Home: ${label} non disponibile`);
        return fallback;
      }
    };
  }

  const latestCache = cached<LatestEpisode[]>('ultimi-episodi');
  const featuredCache = cached<FeaturedAnime[]>('in-evidenza');
  const newsCache = cached<NewsItem[]>('news');

  // Arricchisce i featured col banner: prima il live (se presente), poi il DB, poi null
  // (→ fallback a coverImage lato web). Una sola query DB per ciclo di cache.
  async function loadFeatured(fn: () => Promise<FeaturedAnime[]>): Promise<FeaturedAnime[]> {
    const items = await fn();
    const missing = items.filter((item) => !item.bannerImage).map((item) => item.slug);
    const dbBanners =
      bannerLookup && missing.length > 0 ? bannerLookup(missing) : new Map<string, string | null>();
    return items.map((item) => ({
      ...item,
      bannerImage: item.bannerImage ?? dbBanners.get(item.slug) ?? null,
    }));
  }

  return {
    latestEpisodes(limit = 24): Promise<LatestEpisode[]> {
      const fn = source.getLatestEpisodes;
      return latestCache(fn ? () => fn(limit) : undefined, []);
    },
    featured(): Promise<FeaturedAnime[]> {
      const fn = source.getFeatured;
      return featuredCache(fn ? () => loadFeatured(fn) : undefined, []);
    },
    news(limit = 5): Promise<NewsItem[]> {
      const fn = source.getNews;
      return newsCache(fn ? () => fn(limit) : undefined, []);
    },
  };
}
