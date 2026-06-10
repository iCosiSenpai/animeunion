import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db';
import { schema } from '../db';
import { createHttpClient } from '../lib/http-client';
import type { Logger } from '../lib/logger';
import { apiLoginResponseSchema } from '../sources/api-schemas';

const AUTH_ROW_ID = 'default';
const EXPIRY_MARGIN_MS = 24 * 60 * 60 * 1000;
const FALLBACK_TOKEN_TTL_MS = 59 * 24 * 60 * 60 * 1000;

const loginUserSchema = z.object({
  email: z.string().optional(),
  name: z.string().optional(),
});

export interface AuthServiceOptions {
  db: Db;
  baseUrl: string;
  email?: string;
  password?: string;
  logger: Logger;
  rateLimitMs?: number;
  now?: () => Date;
}

export interface AuthStatus {
  authenticated: boolean;
  expiresAt: string | null;
  userEmail: string | null;
}

export interface AuthService {
  getToken(): Promise<string | null>;
  invalidateAndRelogin(): Promise<void>;
  status(): AuthStatus;
}

function decodeJwtExpiry(token: string): Date | null {
  const payload = token.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    return typeof decoded.exp === 'number' ? new Date(decoded.exp * 1000) : null;
  } catch {
    return null;
  }
}

export function createAuthService(options: AuthServiceOptions): AuthService {
  const now = options.now ?? (() => new Date());
  const http = createHttpClient({ baseUrl: options.baseUrl, rateLimitMs: options.rateLimitMs });
  let cachedToken: string | null = null;
  let cachedExpires: Date | null = null;
  let loginInFlight: Promise<string> | null = null;

  function isValid(expires: Date | null): boolean {
    return expires !== null && expires.getTime() > now().getTime() + EXPIRY_MARGIN_MS;
  }

  function readRow() {
    return options.db.select().from(schema.auth).where(eq(schema.auth.id, AUTH_ROW_ID)).get();
  }

  function persist(token: string, expires: Date, user: unknown): void {
    const timestamp = now().toISOString();
    const parsedUser = loginUserSchema.safeParse(user);
    const userEmail = (parsedUser.success ? parsedUser.data.email : null) ?? options.email ?? null;
    const userName = (parsedUser.success ? parsedUser.data.name : null) ?? null;
    options.db
      .insert(schema.auth)
      .values({
        id: AUTH_ROW_ID,
        accessToken: token,
        refreshToken: '',
        tokenExpires: expires.toISOString(),
        userEmail,
        userName,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: schema.auth.id,
        set: {
          accessToken: token,
          refreshToken: '',
          tokenExpires: expires.toISOString(),
          userEmail,
          userName,
          updatedAt: timestamp,
        },
      })
      .run();
  }

  function login(): Promise<string> {
    if (loginInFlight) {
      return loginInFlight;
    }
    loginInFlight = (async () => {
      const raw = await http.post<unknown>('/auth/login', {
        email: options.email,
        password: options.password,
      });
      const parsed = apiLoginResponseSchema.parse(raw);
      const expires =
        decodeJwtExpiry(parsed.token) ?? new Date(now().getTime() + FALLBACK_TOKEN_TTL_MS);
      persist(parsed.token, expires, parsed.user);
      cachedToken = parsed.token;
      cachedExpires = expires;
      options.logger.info({ expiresAt: expires.toISOString() }, 'Login AnimeUnion riuscito');
      return parsed.token;
    })();
    return loginInFlight.finally(() => {
      loginInFlight = null;
    });
  }

  return {
    async getToken(): Promise<string | null> {
      if (cachedToken && isValid(cachedExpires)) {
        return cachedToken;
      }
      const row = readRow();
      if (row?.accessToken && row.tokenExpires && isValid(new Date(row.tokenExpires))) {
        cachedToken = row.accessToken;
        cachedExpires = new Date(row.tokenExpires);
        return cachedToken;
      }
      if (!options.email || !options.password) {
        return null;
      }
      return login();
    },

    async invalidateAndRelogin(): Promise<void> {
      cachedToken = null;
      cachedExpires = null;
      options.db
        .update(schema.auth)
        .set({ accessToken: null, tokenExpires: null, updatedAt: now().toISOString() })
        .where(eq(schema.auth.id, AUTH_ROW_ID))
        .run();
      if (options.email && options.password) {
        await login();
      }
    },

    status(): AuthStatus {
      const row = readRow();
      const expires = row?.tokenExpires ? new Date(row.tokenExpires) : null;
      return {
        authenticated: Boolean(row?.accessToken && isValid(expires)),
        expiresAt: row?.tokenExpires ?? null,
        userEmail: row?.userEmail ?? null,
      };
    },
  };
}
