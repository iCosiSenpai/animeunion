import type { AnimeSource, UserProfile } from '@animeunion/shared';
import type { Logger } from '../lib/logger';

const TTL_MS = 5 * 60 * 1000;

export interface ProfileService {
  /** Profilo utente dal sito (`/me`). Null se l'endpoint non e disponibile. */
  getMe(): Promise<UserProfile | null>;
}

export interface ProfileServiceDeps {
  source: AnimeSource;
  logger: Logger;
  now?: () => Date;
}

export function createProfileService(deps: ProfileServiceDeps): ProfileService {
  const { source, logger } = deps;
  const now = deps.now ?? (() => new Date());
  let cache: { fetchedAt: number; profile: UserProfile | null } | null = null;

  return {
    async getMe(): Promise<UserProfile | null> {
      if (cache && now().getTime() - cache.fetchedAt < TTL_MS) {
        return cache.profile;
      }
      if (!source.getMe) {
        return null;
      }
      try {
        const profile = await source.getMe();
        cache = { fetchedAt: now().getTime(), profile };
        return profile;
      } catch (error) {
        logger.debug({ err: error }, 'Profilo /me non disponibile');
        cache = { fetchedAt: now().getTime(), profile: null };
        return null;
      }
    },
  };
}
