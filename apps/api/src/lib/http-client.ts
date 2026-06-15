import { fetch } from 'undici';
import { logger } from './logger';
import { createRateLimiter } from './rate-limiter';

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export class AuthError extends ApiError {
  constructor(message: string, body?: unknown) {
    super(message, 401, body);
    this.name = 'AuthError';
  }
}

type QueryValue = string | number | boolean | undefined;

export interface HttpClientOptions {
  baseUrl: string;
  rateLimitMs?: number;
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
}

export interface HttpClient {
  get<T>(path: string, query?: Record<string, QueryValue>): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  del(path: string): Promise<void>;
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const limiter = createRateLimiter(options.rateLimitMs ?? 1000);
  const base = options.baseUrl.replace(/\/+$/, '');

  async function buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const token = options.getToken ? await options.getToken() : null;
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
    return headers;
  }

  function buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(`${base}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  async function parse<T>(response: Awaited<ReturnType<typeof fetch>>): Promise<T> {
    if (response.ok) {
      return (await response.json()) as T;
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    if (response.status === 401) {
      const error = new AuthError('Autenticazione fallita o token scaduto', body);
      logger.error({ status: 401 }, error.message);
      throw error;
    }
    const error = new ApiError(`Richiesta API fallita (${response.status})`, response.status, body);
    logger.error({ status: response.status, body }, error.message);
    throw error;
  }

  return {
    get<T>(path: string, query?: Record<string, QueryValue>): Promise<T> {
      return limiter.schedule(async () => {
        const response = await fetch(buildUrl(path, query), {
          method: 'GET',
          headers: await buildHeaders(),
        });
        return parse<T>(response);
      });
    },
    post<T>(path: string, body?: unknown): Promise<T> {
      return limiter.schedule(async () => {
        const response = await fetch(buildUrl(path), {
          method: 'POST',
          headers: await buildHeaders(),
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return parse<T>(response);
      });
    },
    del(path: string): Promise<void> {
      return limiter.schedule(async () => {
        const response = await fetch(buildUrl(path), {
          method: 'DELETE',
          headers: await buildHeaders(),
        });
        if (response.ok) {
          return;
        }
        await parse<unknown>(response);
      });
    },
  };
}
