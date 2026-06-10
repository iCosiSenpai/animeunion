import type { AnimeSource, SiteStats } from '@animeunion/shared';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env';
import { ApiError, AuthError } from '../lib/http-client';
import { createSource, wrapWithAuthRetry } from './index';

function makeEnv(mode: Env['SOURCE_MODE']): Env {
  return {
    ANIMEUNION_API_URL: 'https://api.test',
    SOURCE_MODE: mode,
    RATE_LIMIT_MS: 1,
    DATABASE_PATH: ':memory:',
    API_PORT: 3001,
  };
}

function makeFailingSource(errors: Error[]): AnimeSource {
  let calls = 0;
  return {
    name: 'finto',
    baseUrl: 'https://finto.test',
    async searchAnime() {
      throw new Error('non usato');
    },
    async getAnimeBySlug() {
      throw new Error('non usato');
    },
    async getSeasonalAnime() {
      return [];
    },
    async getCalendar() {
      return [];
    },
    async getCalendarByDay() {
      throw new Error('non usato');
    },
    async getGenres() {
      return [];
    },
    async getEpisodes() {
      return [];
    },
    async getStats(): Promise<SiteStats> {
      const error = errors[calls];
      calls++;
      if (error) {
        throw error;
      }
      return { totalAnime: 1, totalEpisodes: 2 };
    },
  };
}

describe('createSource', () => {
  it('mock mode ritorna MockSource', () => {
    const source = createSource({
      env: makeEnv('mock'),
      getToken: async () => null,
      onAuthError: async () => {},
    });
    expect(source.name).toBe('mock');
  });

  it('api mode ritorna la source api', () => {
    const source = createSource({
      env: makeEnv('api'),
      getToken: async () => null,
      onAuthError: async () => {},
    });
    expect(source.name).toBe('api');
    expect(source.baseUrl).toBe('https://api.test');
  });

  it('scraper mode lancia errore esplicito', () => {
    expect(() =>
      createSource({
        env: makeEnv('scraper'),
        getToken: async () => null,
        onAuthError: async () => {},
      }),
    ).toThrow(/scraper/);
  });
});

describe('wrapWithAuthRetry', () => {
  it('su AuthError invoca onAuthError e ritenta una volta', async () => {
    const onAuthError = vi.fn(async () => {});
    const source = wrapWithAuthRetry(
      makeFailingSource([new AuthError('token scaduto')]),
      onAuthError,
    );

    const stats = await source.getStats();

    expect(stats).toEqual({ totalAnime: 1, totalEpisodes: 2 });
    expect(onAuthError).toHaveBeenCalledTimes(1);
  });

  it('su doppio AuthError rilancia senza ulteriori retry', async () => {
    const onAuthError = vi.fn(async () => {});
    const source = wrapWithAuthRetry(
      makeFailingSource([new AuthError('scaduto'), new AuthError('ancora scaduto')]),
      onAuthError,
    );

    await expect(source.getStats()).rejects.toBeInstanceOf(AuthError);
    expect(onAuthError).toHaveBeenCalledTimes(1);
  });

  it('errori non auth passano senza retry', async () => {
    const onAuthError = vi.fn(async () => {});
    const source = wrapWithAuthRetry(
      makeFailingSource([new ApiError('errore server', 500)]),
      onAuthError,
    );

    await expect(source.getStats()).rejects.toBeInstanceOf(ApiError);
    expect(onAuthError).not.toHaveBeenCalled();
  });
});
