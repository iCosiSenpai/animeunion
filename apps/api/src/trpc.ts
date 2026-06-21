import type { AnimeSource } from '@animeunion/shared';
import { TRPCError, initTRPC } from '@trpc/server';
import { ZodError } from 'zod';
import type { Db } from './db';
import { NotFoundError, PreconditionError } from './lib/errors';
import { ApiError, AuthError } from './lib/http-client';
import type { Logger } from './lib/logger';
import type { AuthService } from './services/auth-service';
import type { CatalogService } from './services/catalog-service';
import type { ConfigService } from './services/config-service';
import type { DownloadService } from './services/download-service';
import type { FavoritesService } from './services/favorites-service';
import type { FollowService } from './services/follow-service';
import type { HomeService } from './services/home-service';
import type { LibraryService } from './services/library-service';
import type { LockService } from './services/lock-service';
import type { NotificationService } from './services/notification-service';
import type { ProfileService } from './services/profile-service';
import type { PushService } from './services/push-service';
import type { SeriesService } from './services/series-service';

export interface Context {
  db: Db;
  source: AnimeSource;
  services: {
    catalog: CatalogService;
    follow: FollowService;
    favorites: FavoritesService;
    profile: ProfileService;
    home: HomeService;
    config: ConfigService;
    auth: AuthService;
    download: DownloadService;
    library: LibraryService;
    series: SeriesService;
    notifications: NotificationService;
    lock: LockService;
    push: PushService;
  };
  /** Token di sessione del blocco web UI, dall'header x-app-session (per richiesta). */
  sessionToken?: string;
  logger: Logger;
}

const t = initTRPC.context<Context>().create();

function mapTrpcError(error: TRPCError, logger: Logger): TRPCError {
  if (error.code !== 'INTERNAL_SERVER_ERROR') {
    return error;
  }
  const cause = error.cause;
  if (cause instanceof NotFoundError) {
    return new TRPCError({ code: 'NOT_FOUND', message: cause.message, cause });
  }
  if (cause instanceof PreconditionError) {
    return new TRPCError({ code: 'BAD_REQUEST', message: cause.message, cause });
  }
  if (cause instanceof AuthError) {
    return new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Autenticazione verso AnimeUnion fallita',
      cause,
    });
  }
  if (cause instanceof ApiError) {
    if (cause.status === 404) {
      return new TRPCError({
        code: 'NOT_FOUND',
        message: 'Risorsa non trovata sulla API AnimeUnion',
        cause,
      });
    }
    if (cause.status === 429) {
      return new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Rate limit della API AnimeUnion superato',
        cause,
      });
    }
    if (cause.status >= 500) {
      return new TRPCError({
        code: 'BAD_GATEWAY',
        message: 'API AnimeUnion non disponibile',
        cause,
      });
    }
  }
  if (cause instanceof ZodError) {
    return new TRPCError({ code: 'BAD_REQUEST', message: 'Valore non valido', cause });
  }
  logger.error({ err: cause ?? error }, 'Errore interno non gestito');
  return error;
}

const errorMapper = t.middleware(async ({ ctx, next }) => {
  const result = await next();
  if (result.ok) {
    return result;
  }
  const mapped = mapTrpcError(result.error, ctx.logger);
  if (mapped === result.error) {
    return result;
  }
  throw mapped;
});

// Blocco web UI: se un passcode è impostato e non arriva un token di sessione valido,
// rifiuta. Le procedure di lock (status/unlock) usano openProcedure e restano accessibili.
const lockGuard = t.middleware(async ({ ctx, next }) => {
  if (ctx.services.lock.isEnabled() && !ctx.services.lock.verifyToken(ctx.sessionToken)) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'App bloccata: inserisci il passcode' });
  }
  return next();
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
const baseProcedure = t.procedure.use(errorMapper);
/** Senza blocco: solo per lock.status / lock.unlock. */
export const openProcedure = baseProcedure;
/** Tutte le altre procedure: protette dal blocco web UI quando attivo. */
export const publicProcedure = baseProcedure.use(lockGuard);
export const protectedProcedure = publicProcedure;
