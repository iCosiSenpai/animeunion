import type { AnimeSource, Favorite, HistoryEntry, WatchlistItem } from '@animeunion/shared';
import { eq, inArray, max } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import type { Logger } from '../lib/logger';
import type { CatalogService } from './catalog-service';
import type { ConfigService } from './config-service';

const CURSOR_KEY = 'favorites_synced_at';

export interface FavoritesSyncResult {
  imported: number;
  enqueued: number;
}

export interface FavoritesService {
  /** Import completo dei preferiti del sito (usato all'avvio). Non distruttivo. */
  importFromSite(): Promise<FavoritesSyncResult>;
  /** Sync incrementale via `?updatedSince=<cursor>` (usato dallo scheduler). */
  pollUpdates(): Promise<FavoritesSyncResult>;
  getWatchlist(): Promise<WatchlistItem[]>;
  getHistory(): Promise<HistoryEntry[]>;
}

export interface FavoritesServiceDeps {
  db: Db;
  source: AnimeSource;
  catalog: CatalogService;
  config: ConfigService;
  logger: Logger;
  now?: () => Date;
}

export function createFavoritesService(deps: FavoritesServiceDeps): FavoritesService {
  const { db, source, catalog, logger } = deps;
  const now = deps.now ?? (() => new Date());

  function getCursor(): string | null {
    const row = db.select().from(schema.stats).where(eq(schema.stats.key, CURSOR_KEY)).get();
    if (!row) {
      return null;
    }
    try {
      const value = JSON.parse(row.value);
      return typeof value === 'string' ? value : null;
    } catch {
      return null;
    }
  }

  function setCursor(iso: string): void {
    const timestamp = now().toISOString();
    db.insert(schema.stats)
      .values({ key: CURSOR_KEY, value: JSON.stringify(iso), updatedAt: timestamp })
      .onConflictDoUpdate({
        target: schema.stats.key,
        set: { value: JSON.stringify(iso), updatedAt: timestamp },
      })
      .run();
  }

  function animeExists(animeId: string): boolean {
    return (
      db
        .select({ id: schema.anime.id })
        .from(schema.anime)
        .where(eq(schema.anime.id, animeId))
        .get() !== undefined
    );
  }

  /**
   * Garantisce che l'anime (ed i suoi episodi) siano in cache; ritorna l'id o null.
   * `catalog.getBySlug` e idempotente e applica la propria logica di freshness: serve dal DB
   * quando i dati sono freschi, altrimenti rinfresca dal sito (necessario per l'auto-download
   * che ha bisogno degli episodi, non solo del summary).
   */
  async function ensureAnimeCached(fav: Favorite): Promise<string | null> {
    try {
      const detail = await catalog.getBySlug(fav.slug);
      return detail.id;
    } catch (error) {
      if (animeExists(fav.animeId)) {
        return fav.animeId;
      }
      logger.warn(
        { err: error, slug: fav.slug },
        'Preferito non importabile: anime non in catalogo',
      );
      return null;
    }
  }

  // Massimo numero episodio noto a catalogo: soglia forward-only per l'auto-download.
  function maxEpisode(animeId: string): number {
    const row = db
      .select({ value: max(schema.episode.number) })
      .from(schema.episode)
      .where(eq(schema.episode.animeId, animeId))
      .get();
    return row?.value ?? 0;
  }

  /** Inserisce/aggiorna la riga follow locale senza ri-propagare al sito. */
  function upsertFollow(animeId: string): void {
    const existing = db
      .select({ id: schema.follow.id })
      .from(schema.follow)
      .where(eq(schema.follow.animeId, animeId))
      .get();
    if (existing) {
      return;
    }
    const timestamp = now().toISOString();
    db.insert(schema.follow)
      .values({
        id: crypto.randomUUID(),
        animeId,
        status: 'plan_to_watch',
        notes: null,
        // Forward-only: cattura il backlog gia' uscito al momento dell'import, cosi' se in seguito
        // il follow passa a "In corso" l'auto-download parte dai nuovi episodi, non dall'intero
        // backlog (evita il download di massa a sorpresa).
        autoDownloadFromEp: maxEpisode(animeId),
        addedAt: timestamp,
        updatedAt: timestamp,
        lastCheckAt: null,
      })
      .onConflictDoNothing()
      .run();
  }

  async function applyFavorites(favorites: Favorite[]): Promise<FavoritesSyncResult> {
    let imported = 0;
    const enqueued = 0;
    for (const fav of favorites) {
      const animeId = await ensureAnimeCached(fav);
      if (!animeId) {
        continue;
      }
      upsertFollow(animeId);
      imported += 1;
    }
    // I download NON vengono piu' accodati qui: la vecchia enqueueDownloads riaccodava l'intero
    // backlog ad ogni sync (all'avvio + ogni 10 min) bypassando sia la soglia forward-only sia il
    // self-healing su disco, causando ri-download/sovrascritture di massa. Ora la sync preferiti
    // importa solo i follow; a scaricare i nuovi episodi pensa SOLO lo scheduler
    // (download.enqueueForAutoFollows: forward-only + healPresent).
    return { imported, enqueued };
  }

  return {
    async importFromSite(): Promise<FavoritesSyncResult> {
      if (!source.getFavorites) {
        return { imported: 0, enqueued: 0 };
      }
      try {
        const favorites = await source.getFavorites();
        const result = await applyFavorites(favorites);
        setCursor(now().toISOString());
        logger.info(result, 'Import preferiti dal sito completato');
        return result;
      } catch (error) {
        logger.warn({ err: error }, 'Import preferiti non riuscito (endpoint assente o offline)');
        return { imported: 0, enqueued: 0 };
      }
    },

    async pollUpdates(): Promise<FavoritesSyncResult> {
      if (!source.getFavorites) {
        return { imported: 0, enqueued: 0 };
      }
      const cursor = getCursor();
      try {
        const favorites = await source.getFavorites(cursor ?? undefined);
        const result = await applyFavorites(favorites);
        setCursor(now().toISOString());
        if (result.imported > 0 || result.enqueued > 0) {
          logger.info(result, 'Sync incrementale preferiti');
        }
        return result;
      } catch (error) {
        logger.debug({ err: error }, 'Polling preferiti non riuscito');
        return { imported: 0, enqueued: 0 };
      }
    },

    async getWatchlist(): Promise<WatchlistItem[]> {
      if (!source.getWatchlist) {
        return [];
      }
      try {
        return await source.getWatchlist();
      } catch (error) {
        logger.debug({ err: error }, 'Watchlist non disponibile');
        return [];
      }
    },

    async getHistory(): Promise<HistoryEntry[]> {
      if (!source.getHistory) {
        return [];
      }
      try {
        const items = await source.getHistory();
        // Arricchisce con titolo/cover dalla cache locale (se l'anime e gia stato sincronizzato).
        const slugs = [...new Set(items.map((item) => item.slug))];
        const cached =
          slugs.length > 0
            ? db
                .select({
                  slug: schema.anime.slug,
                  title: schema.anime.title,
                  titleIta: schema.anime.titleIta,
                  coverImage: schema.anime.coverImage,
                })
                .from(schema.anime)
                .where(inArray(schema.anime.slug, slugs))
                .all()
            : [];
        const bySlug = new Map(cached.map((row) => [row.slug, row]));
        return items.map((item) => {
          const anime = bySlug.get(item.slug);
          return {
            ...item,
            title: anime?.titleIta ?? anime?.title ?? null,
            coverImage: anime?.coverImage ?? null,
          };
        });
      } catch (error) {
        logger.debug({ err: error }, 'Cronologia non disponibile');
        return [];
      }
    },
  };
}
