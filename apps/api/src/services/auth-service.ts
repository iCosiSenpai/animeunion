import type { SocialPollOutput, SocialProvider, SocialStartOutput } from '@animeunion/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db';
import { schema } from '../db';
import { decryptPassword, decryptSecret, encryptPassword, encryptSecret } from '../lib/crypto';
import { AuthError, createHttpClient } from '../lib/http-client';
import type { Logger } from '../lib/logger';
import {
  apiLoginResponseSchema,
  apiSocialPollSchema,
  apiSocialStartSchema,
} from '../sources/api-schemas';

const AUTH_ROW_ID = 'default';
const EXPIRY_MARGIN_MS = 24 * 60 * 60 * 1000;
const FALLBACK_TOKEN_TTL_MS = 3_600_000;

const loginUserSchema = z.object({
  email: z.string().optional(),
  name: z.string().optional(),
});

interface Credentials {
  email: string;
  password: string;
}

export interface AuthServiceOptions {
  db: Db;
  baseUrl: string;
  email?: string;
  password?: string;
  logger: Logger;
  rateLimitMs?: number;
  now?: () => Date;
  // Chiave per cifrare la password nel DB (AES-256-GCM). Se assente → plaintext + warning.
  encryptKey?: string;
}

export interface AuthStatus {
  authenticated: boolean;
  expiresAt: string | null;
  userEmail: string | null;
}

export interface AuthService {
  getToken(): Promise<string | null>;
  loginWithCredentials(email: string, password: string): Promise<AuthStatus>;
  socialStart(provider: SocialProvider): Promise<SocialStartOutput>;
  socialPoll(): Promise<SocialPollOutput>;
  invalidateAndRelogin(): Promise<void>;
  logout(): void;
  status(): AuthStatus;
}

interface PendingSocialFlow {
  deviceCode: string;
  expiresAt: Date;
  interval: number;
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
  // L'app e mono-utente: un solo device flow social pendente alla volta. Il device_code resta qui
  // (segreto), non viene mai esposto al client.
  let pendingSocial: PendingSocialFlow | null = null;

  function isValid(expires: Date | null): boolean {
    return expires !== null && expires.getTime() > now().getTime() + EXPIRY_MARGIN_MS;
  }

  function readRow() {
    return options.db.select().from(schema.auth).where(eq(schema.auth.id, AUTH_ROW_ID)).get();
  }

  function resolveCredentials(): Credentials | null {
    const row = readRow();
    if (row?.userEmail && row?.password) {
      const plain = options.encryptKey
        ? decryptPassword(row.password, options.encryptKey)
        : row.password;
      return { email: row.userEmail, password: plain };
    }
    if (options.email && options.password) {
      return { email: options.email, password: options.password };
    }
    return null;
  }

  function persist(token: string, expires: Date, user: unknown, password?: string): void {
    const timestamp = now().toISOString();
    const parsedUser = loginUserSchema.safeParse(user);
    const userEmail = (parsedUser.success ? parsedUser.data.email : null) ?? options.email ?? null;
    const userName = (parsedUser.success ? parsedUser.data.name : null) ?? null;
    // Il token di accesso e' un segreto: cifralo a riposo (se c'e' la chiave) cosi' non finisce in
    // chiaro nei backup del DB. La cache in memoria resta il token in chiaro.
    const storedToken = options.encryptKey ? encryptSecret(token, options.encryptKey) : token;
    const set: Record<string, string | null> = {
      accessToken: storedToken,
      refreshToken: '',
      tokenExpires: expires.toISOString(),
      userEmail,
      userName,
      updatedAt: timestamp,
    };
    let storedPassword: string | null = password ?? null;
    if (password !== undefined && password !== null) {
      if (!options.encryptKey) {
        options.logger.warn(
          'AUTH_ENCRYPT_KEY non configurata: la password AnimeUnion è salvata in chiaro nel DB',
        );
      } else {
        storedPassword = encryptPassword(password, options.encryptKey);
      }
    }
    if (password !== undefined) {
      set.password = storedPassword;
    }
    options.db
      .insert(schema.auth)
      .values({
        id: AUTH_ROW_ID,
        accessToken: storedToken,
        refreshToken: '',
        tokenExpires: expires.toISOString(),
        userEmail,
        userName,
        password: storedPassword,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({ target: schema.auth.id, set })
      .run();
  }

  function doLogin(credentials: Credentials, storePassword: boolean): Promise<string> {
    loginInFlight = (async () => {
      const raw = await http.post<unknown>('/auth/login', credentials);
      const parsed = apiLoginResponseSchema.parse(raw);
      const expires =
        decodeJwtExpiry(parsed.token) ?? new Date(now().getTime() + FALLBACK_TOKEN_TTL_MS);
      persist(parsed.token, expires, parsed.user, storePassword ? credentials.password : undefined);
      cachedToken = parsed.token;
      cachedExpires = expires;
      options.logger.info({ expiresAt: expires.toISOString() }, 'Login AnimeUnion riuscito');
      return parsed.token;
    })();
    return loginInFlight.finally(() => {
      loginInFlight = null;
    });
  }

  function login(): Promise<string> {
    if (loginInFlight) {
      return loginInFlight;
    }
    const credentials = resolveCredentials();
    if (!credentials) {
      return Promise.reject(new AuthError('Credenziali AnimeUnion mancanti'));
    }
    return doLogin(credentials, false);
  }

  function buildStatus(): AuthStatus {
    const row = readRow();
    const expires = row?.tokenExpires ? new Date(row.tokenExpires) : null;
    return {
      authenticated: Boolean(row?.accessToken && isValid(expires)),
      expiresAt: row?.tokenExpires ?? null,
      userEmail: row?.userEmail ?? null,
    };
  }

  return {
    async getToken(): Promise<string | null> {
      if (cachedToken && isValid(cachedExpires)) {
        return cachedToken;
      }
      const row = readRow();
      if (row?.accessToken && row.tokenExpires && isValid(new Date(row.tokenExpires))) {
        cachedToken = options.encryptKey
          ? decryptSecret(row.accessToken, options.encryptKey)
          : row.accessToken;
        cachedExpires = new Date(row.tokenExpires);
        return cachedToken;
      }
      if (!resolveCredentials()) {
        return null;
      }
      return login();
    },

    async loginWithCredentials(email: string, password: string): Promise<AuthStatus> {
      await doLogin({ email, password }, true);
      return buildStatus();
    },

    async socialStart(provider: SocialProvider): Promise<SocialStartOutput> {
      const raw = await http.post<unknown>('/auth/social/start', { provider });
      const parsed = apiSocialStartSchema.parse(raw);
      pendingSocial = {
        deviceCode: parsed.device_code,
        expiresAt: new Date(now().getTime() + parsed.expires_in * 1000),
        interval: parsed.interval,
      };
      return {
        userCode: parsed.user_code,
        verificationUri: parsed.verification_uri,
        verificationUriComplete: parsed.verification_uri_complete,
        expiresIn: parsed.expires_in,
        interval: parsed.interval,
      };
    },

    async socialPoll(): Promise<SocialPollOutput> {
      if (!pendingSocial || pendingSocial.expiresAt.getTime() <= now().getTime()) {
        pendingSocial = null;
        return { status: 'expired', auth: null };
      }
      const raw = await http.post<unknown>('/auth/social/poll', {
        device_code: pendingSocial.deviceCode,
      });
      const parsed = apiSocialPollSchema.parse(raw);
      if (parsed.status === 'approved' && parsed.token) {
        const fallbackMs = parsed.expires_in ? parsed.expires_in * 1000 : FALLBACK_TOKEN_TTL_MS;
        const expires = decodeJwtExpiry(parsed.token) ?? new Date(now().getTime() + fallbackMs);
        // Token social: stesso uso di quello email/password, ma niente password da memorizzare.
        persist(parsed.token, expires, parsed.user);
        cachedToken = parsed.token;
        cachedExpires = expires;
        pendingSocial = null;
        options.logger.info(
          { expiresAt: expires.toISOString() },
          'Login social AnimeUnion riuscito',
        );
        return { status: 'approved', auth: buildStatus() };
      }
      if (parsed.status === 'denied' || parsed.status === 'expired') {
        pendingSocial = null;
      }
      return { status: parsed.status, auth: null };
    },

    async invalidateAndRelogin(): Promise<void> {
      cachedToken = null;
      cachedExpires = null;
      options.db
        .update(schema.auth)
        .set({ accessToken: null, tokenExpires: null, updatedAt: now().toISOString() })
        .where(eq(schema.auth.id, AUTH_ROW_ID))
        .run();
      if (resolveCredentials()) {
        await login();
      }
    },

    logout(): void {
      cachedToken = null;
      cachedExpires = null;
      options.db
        .update(schema.auth)
        .set({
          accessToken: null,
          tokenExpires: null,
          password: null,
          updatedAt: now().toISOString(),
        })
        .where(eq(schema.auth.id, AUTH_ROW_ID))
        .run();
    },

    status(): AuthStatus {
      return buildStatus();
    },
  };
}
