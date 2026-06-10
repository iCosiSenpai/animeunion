import type { AnimeSource } from '@animeunion/shared';
import type { Env } from '../config/env';
import { AuthError } from '../lib/http-client';
import { createApiSource } from './api-source';
import { createMockSource } from './mock-source';

export interface CreateSourceOptions {
  env: Env;
  getToken: () => Promise<string | null>;
  onAuthError: () => Promise<void>;
}

export function wrapWithAuthRetry(
  source: AnimeSource,
  onAuthError: () => Promise<void>,
): AnimeSource {
  return new Proxy(source, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') {
        return value;
      }
      return async (...args: unknown[]) => {
        try {
          return await value.apply(target, args);
        } catch (error) {
          if (!(error instanceof AuthError)) {
            throw error;
          }
          await onAuthError();
          return value.apply(target, args);
        }
      };
    },
  });
}

export function createSource(options: CreateSourceOptions): AnimeSource {
  switch (options.env.SOURCE_MODE) {
    case 'mock':
      return createMockSource();
    case 'api':
      return wrapWithAuthRetry(
        createApiSource({
          baseUrl: options.env.ANIMEUNION_API_URL,
          rateLimitMs: options.env.RATE_LIMIT_MS,
          getToken: options.getToken,
        }),
        options.onAuthError,
      );
    case 'scraper':
      throw new Error('SOURCE_MODE scraper non implementato (post-v1)');
  }
}
