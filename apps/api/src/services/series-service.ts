import type {
  AnimeDetail,
  PathPreview,
  PathPreviewInput,
  RelatedAnime,
  SeriesOverrideInput,
  SeriesResolved,
} from '@animeunion/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import { NotFoundError, PreconditionError } from '../lib/errors';
import type { CatalogService } from './catalog-service';
import type { ConfigService } from './config-service';
import type { RenamerService } from './renamer-service';
import type { OverrideParams, SeriesResolver } from './series-resolver';

// Relazioni che fanno parte della "stessa saga" (espanse dalla BFS franchise). NON
// ALTERNATIVE/CHARACTER/SUMMARY/OTHER, che porterebbero a opere diverse.
const FRANCHISE_RELATIONS = new Set([
  'PREQUEL',
  'SEQUEL',
  'SPIN_OFF',
  'SIDE_STORY',
  'PARENT_STORY',
]);

export interface SeriesService {
  /** Stagione/serie/tipo correnti per un anime (dopo override/euristica). */
  getResolved(animeId: string): SeriesResolved;
  /** Imposta o aggiorna l'override manuale. Campi a null azzerano quel campo. */
  setOverride(input: SeriesOverrideInput): SeriesResolved;
  /** Rimuove l'override: si torna a euristica/API. */
  clearOverride(animeId: string): SeriesResolved;
  /** Anteprima del percorso su disco (con parametri ipotetici non ancora salvati). */
  previewPath(input: PathPreviewInput): PathPreview;
  /**
   * Scopre l'intero franchise partendo da uno slug: BFS che segue le relazioni di "stessa saga"
   * e fa fetch+cache di ogni nodo (cosi' emergono anche le stagioni transitive S3/S4...).
   * Ritorna le entry correlate (escluso lo start) con seasonNumber risolto, ordinate.
   */
  franchise(startSlug: string, maxNodes?: number): Promise<RelatedAnime[]>;
}

export interface SeriesServiceDeps {
  db: Db;
  resolver: SeriesResolver;
  catalog: CatalogService;
  renamer: RenamerService;
  config: ConfigService;
  now?: () => Date;
}

export function createSeriesService(deps: SeriesServiceDeps): SeriesService {
  const { db, resolver, catalog, renamer, config } = deps;
  const now = deps.now ?? (() => new Date());

  // L'utente ha gia' scaricato/accodato da questa serie? Allora la stagione e' di
  // fatto gia' decisa: non serve richiedere la conferma.
  function hasExistingDownload(animeId: string): boolean {
    const downloaded = db
      .select({ id: schema.episodeFile.id })
      .from(schema.episodeFile)
      .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
      .where(
        and(
          eq(schema.episode.animeId, animeId),
          eq(schema.episodeFile.downloadStatus, 'downloaded'),
        ),
      )
      .get();
    if (downloaded) {
      return true;
    }
    const queued = db
      .select({ id: schema.downloadQueue.id })
      .from(schema.downloadQueue)
      .innerJoin(schema.episodeFile, eq(schema.episodeFile.id, schema.downloadQueue.episodeFileId))
      .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
      .where(eq(schema.episode.animeId, animeId))
      .get();
    return !!queued;
  }

  function resolved(animeId: string): SeriesResolved {
    const info = resolver.resolve(animeId);
    const root = db
      .select({ title: schema.anime.title, titleIta: schema.anime.titleIta })
      .from(schema.anime)
      .where(eq(schema.anime.id, info.seriesId))
      .get();
    const self = db
      .select({ type: schema.anime.type })
      .from(schema.anime)
      .where(eq(schema.anime.id, animeId))
      .get();
    const override = db
      .select({ animeId: schema.seriesOverride.animeId })
      .from(schema.seriesOverride)
      .where(eq(schema.seriesOverride.animeId, animeId))
      .get();
    const hasOverride = !!override;
    return {
      animeId,
      seasonNumber: info.seasonNumber,
      partNumber: info.partNumber,
      seriesAnimeId: info.seriesId,
      seriesSlug: info.seriesSlug,
      seriesTitle: root?.titleIta ?? root?.title ?? info.seriesSlug,
      kind: info.kind,
      type: (self?.type ?? 'TV') as SeriesResolved['type'],
      hasOverride,
      confirmed: hasOverride || hasExistingDownload(animeId),
    };
  }

  return {
    getResolved(animeId) {
      const exists = db
        .select({ id: schema.anime.id })
        .from(schema.anime)
        .where(eq(schema.anime.id, animeId))
        .get();
      if (!exists) {
        throw new NotFoundError(`Anime non trovato: ${animeId}`);
      }
      return resolved(animeId);
    },

    setOverride({ animeId, seasonNumber, seriesAnimeId, kind, partNumber }) {
      const exists = db
        .select({ id: schema.anime.id })
        .from(schema.anime)
        .where(eq(schema.anime.id, animeId))
        .get();
      if (!exists) {
        throw new NotFoundError(`Anime non trovato: ${animeId}`);
      }
      if (seriesAnimeId) {
        if (seriesAnimeId === animeId) {
          throw new PreconditionError('Una serie non può essere madre di se stessa.');
        }
        const root = db
          .select({ id: schema.anime.id })
          .from(schema.anime)
          .where(eq(schema.anime.id, seriesAnimeId))
          .get();
        if (!root) {
          throw new NotFoundError(`Serie madre non trovata: ${seriesAnimeId}`);
        }
        // Evita il 2-ciclo: la serie madre proposta ha già questa serie come propria madre.
        const reverse = db
          .select({ animeId: schema.seriesOverride.animeId })
          .from(schema.seriesOverride)
          .where(
            and(
              eq(schema.seriesOverride.animeId, seriesAnimeId),
              eq(schema.seriesOverride.seriesAnimeId, animeId),
            ),
          )
          .get();
        if (reverse) {
          throw new PreconditionError(
            'Ciclo non valido: la serie madre scelta ha già questa serie come madre.',
          );
        }
      }
      const effectiveKind = kind ?? 'auto';
      // La parte vale solo per una stagione normale: la normalizzo (1 = nessuna parte).
      const effectivePart = seasonNumber != null && seasonNumber > 0 ? (partNumber ?? null) : null;
      // Override vuoto = nessun vincolo: equivale a rimuoverlo.
      if (
        seasonNumber == null &&
        seriesAnimeId == null &&
        effectiveKind === 'auto' &&
        effectivePart == null
      ) {
        return this.clearOverride(animeId);
      }
      const timestamp = now().toISOString();
      db.insert(schema.seriesOverride)
        .values({
          animeId,
          seriesAnimeId: seriesAnimeId ?? null,
          seasonNumber: seasonNumber ?? null,
          partNumber: effectivePart,
          kind: effectiveKind,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: schema.seriesOverride.animeId,
          set: {
            seriesAnimeId: seriesAnimeId ?? null,
            seasonNumber: seasonNumber ?? null,
            partNumber: effectivePart,
            kind: effectiveKind,
            updatedAt: timestamp,
          },
        })
        .run();
      return resolved(animeId);
    },

    clearOverride(animeId) {
      db.delete(schema.seriesOverride).where(eq(schema.seriesOverride.animeId, animeId)).run();
      return resolved(animeId);
    },

    previewPath(input) {
      const exists = db
        .select({ id: schema.anime.id })
        .from(schema.anime)
        .where(eq(schema.anime.id, input.animeId))
        .get();
      if (!exists) {
        throw new NotFoundError(`Anime non trovato: ${input.animeId}`);
      }
      const language = input.language ?? config.get('language');
      const episodeNumber = input.episodeNumber ?? 1;
      const hasHypothesis =
        input.kind != null ||
        input.seasonNumber != null ||
        input.seriesAnimeId != null ||
        input.partNumber != null;
      const override: OverrideParams | undefined = hasHypothesis
        ? {
            kind: input.kind ?? undefined,
            seasonNumber: input.seasonNumber ?? undefined,
            seriesAnimeId: input.seriesAnimeId ?? undefined,
            partNumber: input.partNumber ?? undefined,
          }
        : undefined;
      const path = renamer.previewPath({
        animeId: input.animeId,
        episodeNumber,
        language,
        override,
      });
      const series = override
        ? resolver.resolveWith(input.animeId, override)
        : resolver.resolve(input.animeId);
      return { path, kind: series.kind };
    },

    async franchise(startSlug, maxNodes = 30) {
      const start = await catalog.getBySlug(startSlug);
      const visited = new Set<string>([start.id]);
      const result = new Map<string, RelatedAnime>();
      const queue: AnimeDetail[] = [start];

      while (queue.length > 0 && visited.size <= maxNodes) {
        const node = queue.shift();
        if (!node) {
          continue;
        }
        for (const rel of node.relatedAnime) {
          if (!FRANCHISE_RELATIONS.has(rel.relationType) || visited.has(rel.id)) {
            continue;
          }
          visited.add(rel.id);
          result.set(rel.id, rel);
          try {
            // Fetch+cache delle SUE relazioni: cosi' la BFS raggiunge le stagioni transitive.
            const detail = await catalog.getBySlug(rel.slug);
            queue.push(detail);
          } catch {
            // Link scaduto/404/source giu': resta foglia dal summary, non aborta la scoperta.
          }
        }
      }

      // Grafo ora completo in cache: risolvo la stagione di ogni entry e ordino.
      const entries = [...result.values()].map((rel) => ({
        ...rel,
        seasonNumber: resolver.resolve(rel.id).seasonNumber,
      }));
      entries.sort((a, b) => {
        const sa = a.seasonNumber ?? Number.POSITIVE_INFINITY;
        const sb = b.seasonNumber ?? Number.POSITIVE_INFINITY;
        if (sa !== sb) {
          return sa - sb;
        }
        return (a.seasonYear ?? 0) - (b.seasonYear ?? 0);
      });
      return entries;
    },
  };
}
