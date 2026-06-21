import { asc, eq, ne } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import type { Logger } from '../lib/logger';
import type { CatalogService } from './catalog-service';
import type { ConfigService } from './config-service';
import type { NotificationService } from './notification-service';

// Relazioni considerate "stessa serie" per la notifica nuova stagione/contenuto.
const SEASON_RELATIONS = new Set(['PREQUEL', 'SEQUEL', 'SPIN_OFF', 'SIDE_STORY', 'PARENT_STORY']);
// Quanti follow controllare per tick (rotazione via lastCheckAt) per non sovraccaricare la source.
const BATCH = 15;

export interface SeasonWatcher {
  /** Controlla un batch di follow e notifica le nuove stagioni. Ritorna quante notifiche ha creato. */
  checkNewSeasons(): Promise<number>;
}

export interface SeasonWatcherDeps {
  db: Db;
  catalog: CatalogService;
  notifications: NotificationService;
  config: ConfigService;
  logger?: Logger;
  now?: () => Date;
}

export function createSeasonWatcher(deps: SeasonWatcherDeps): SeasonWatcher {
  const { db, catalog, notifications, config, logger } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    async checkNewSeasons() {
      if (!config.get('notifyNewSeasons')) {
        return 0;
      }
      const follows = db
        .select({
          id: schema.follow.id,
          animeId: schema.follow.animeId,
          known: schema.follow.knownRelationIds,
          slug: schema.anime.slug,
          title: schema.anime.title,
          titleIta: schema.anime.titleIta,
        })
        .from(schema.follow)
        .innerJoin(schema.anime, eq(schema.anime.id, schema.follow.animeId))
        .where(ne(schema.follow.status, 'dropped'))
        .orderBy(asc(schema.follow.lastCheckAt)) // null prima → i mai controllati per primi
        .limit(BATCH)
        .all();

      let notified = 0;
      for (const f of follows) {
        const timestamp = now().toISOString();
        try {
          const detail = await catalog.getBySlug(f.slug, { forceRefresh: true });
          const current = detail.relatedAnime.filter((r) => SEASON_RELATIONS.has(r.relationType));
          const currentIds = current.map((r) => r.id);

          let known: string[] | null;
          try {
            known = f.known ? (JSON.parse(f.known) as string[]) : null;
          } catch {
            known = null;
          }

          if (known === null) {
            // Prima scansione: registra la baseline senza notificare (niente flood).
            db.update(schema.follow)
              .set({ knownRelationIds: JSON.stringify(currentIds), lastCheckAt: timestamp })
              .where(eq(schema.follow.id, f.id))
              .run();
            continue;
          }

          const knownSet = new Set(known);
          const seriesTitle = f.titleIta ?? f.title;
          for (const r of current) {
            if (knownSet.has(r.id)) {
              continue;
            }
            notifications.create({
              type: 'season_available',
              title:
                r.relationType === 'SEQUEL'
                  ? `Nuova stagione: ${seriesTitle}`
                  : `Nuovo contenuto: ${seriesTitle}`,
              body: r.titleIta ?? r.title,
              animeId: f.animeId,
            });
            notified += 1;
          }

          const merged = [...new Set([...known, ...currentIds])];
          db.update(schema.follow)
            .set({ knownRelationIds: JSON.stringify(merged), lastCheckAt: timestamp })
            .where(eq(schema.follow.id, f.id))
            .run();
        } catch (error) {
          logger?.debug({ err: error, slug: f.slug }, 'season-watcher: controllo fallito');
          // Rotazione: aggiorna comunque lastCheckAt così il batch avanza.
          db.update(schema.follow)
            .set({ lastCheckAt: timestamp })
            .where(eq(schema.follow.id, f.id))
            .run();
        }
      }

      if (notified > 0) {
        logger?.info({ notified }, 'season-watcher: nuove stagioni rilevate');
      }
      return notified;
    },
  };
}
