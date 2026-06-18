import type { AnimeSource } from '@animeunion/shared';
import { TRPCError, initTRPC } from '@trpc/server';
import { ZodError } from 'zod';
import type { Db } from './db';
import { NotFoundError } from './lib/errors';
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
import type { ProfileService } from './services/profile-service';

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
  };
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

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure.use(errorMapper);
export const protectedProcedure = publicProcedure;
