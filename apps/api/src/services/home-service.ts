import type { AnimeSource, AnimeSummary, LatestEpisode, NewsItem } from '@animeunion/shared';
import type { Logger } from '../lib/logger';

const TTL_MS = 10 * 60 * 1000;

export interface HomeService {
  latestEpisodes(limit?: number): Promise<LatestEpisode[]>;
  featured(): Promise<AnimeSummary[]>;
  news(limit?: number): Promise<NewsItem[]>;
}

export interface HomeServiceDeps {
  source: AnimeSource;
  logger: Logger;
  now?: () => Date;
}

export function createHomeService(deps: HomeServiceDeps): HomeService {
  const { source, logger } = deps;
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
  const featuredCache = cached<AnimeSummary[]>('in-evidenza');
  const newsCache = cached<NewsItem[]>('news');

  return {
    latestEpisodes(limit = 24): Promise<LatestEpisode[]> {
      const fn = source.getLatestEpisodes;
      return latestCache(fn ? () => fn(limit) : undefined, []);
    },
    featured(): Promise<AnimeSummary[]> {
      const fn = source.getFeatured;
      return featuredCache(fn ? () => fn() : undefined, []);
    },
    news(limit = 5): Promise<NewsItem[]> {
      const fn = source.getNews;
      return newsCache(fn ? () => fn(limit) : undefined, []);
    },
  };
}
