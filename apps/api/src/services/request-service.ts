import type { AnimeSummary, RequestInput } from '@animeunion/shared';
import { NotFoundError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import type { CatalogService } from './catalog-service';
import type { SeriesResolver } from './series-resolver';

/** Entry AnimeUnion risolta da una richiesta in ingresso (il cour/stagione esatto). */
export interface ResolvedEntry {
  animeId: string;
  slug: string;
  title: string;
  seasonNumber: number;
}

export interface RequestService {
  /**
   * Risolve una richiesta (ontologia anime) nella entry/cour AnimeUnion corrispondente.
   * Priorita: slug (esatto) → anilistId/malId (esatto, solo cache) → title (fuzzy via ricerca).
   */
  resolve(input: RequestInput): Promise<ResolvedEntry>;
}

export interface RequestServiceDeps {
  catalog: CatalogService;
  resolver: SeriesResolver;
  logger?: Logger;
}

export function createRequestService(deps: RequestServiceDeps): RequestService {
  const { catalog, resolver } = deps;

  function normalize(value: string): string {
    return value.trim().toLowerCase();
  }

  /** Sceglie il miglior match per titolo: preferisce l'uguaglianza esatta, altrimenti il primo. */
  function pickBest(candidates: AnimeSummary[], title: string): AnimeSummary | undefined {
    const needle = normalize(title);
    return (
      candidates.find(
        (c) => normalize(c.title) === needle || (c.titleIta && normalize(c.titleIta) === needle),
      ) ?? candidates[0]
    );
  }

  function toEntry(
    animeId: string,
    slug: string,
    title: string,
    seasonOverride?: number,
  ): ResolvedEntry {
    const seasonNumber = seasonOverride ?? resolver.resolve(animeId).seasonNumber;
    return { animeId, slug, title, seasonNumber };
  }

  return {
    async resolve(input): Promise<ResolvedEntry> {
      // 1. slug: identificatore esatto, popola anche la cache.
      if (input.slug) {
        const detail = await catalog.getBySlug(input.slug);
        return toEntry(detail.id, detail.slug, detail.titleIta ?? detail.title);
      }

      // 2. id esterno (MAL/AniList): match esatto ma solo contro la cache locale.
      if (input.anilistId != null || input.malId != null) {
        const hit = catalog.findByExternalId({ anilistId: input.anilistId, malId: input.malId });
        if (hit) {
          const detail = await catalog.getBySlug(hit.slug);
          return toEntry(detail.id, detail.slug, detail.titleIta ?? detail.title);
        }
        // Niente in cache: senza un title di fallback non possiamo risolvere (l'API
        // AnimeUnion non espone lookup per id esterno).
        if (!input.title) {
          throw new NotFoundError(
            "Anime non in cache per l'id esterno fornito. Riprova con slug o title.",
          );
        }
      }

      // 3. title: match fuzzy via ricerca (colpisce l'API live tramite il catalog).
      if (input.title) {
        const page = await catalog.search({ query: input.title, page: 1 });
        if (page.data.length === 0) {
          throw new NotFoundError(`Nessun anime trovato per "${input.title}"`);
        }

        const season = input.season;
        if (season != null && season > 1) {
          // Disambigua la stagione: scegli il candidato la cui stagione risolta combacia.
          for (const candidate of page.data) {
            if (resolver.resolve(candidate.id).seasonNumber === season) {
              const detail = await catalog.getBySlug(candidate.slug);
              return toEntry(detail.id, detail.slug, detail.titleIta ?? detail.title, season);
            }
          }
          throw new NotFoundError(
            `Stagione ${season} non trovata per "${input.title}". Specifica lo slug della stagione.`,
          );
        }

        const best = pickBest(page.data, input.title);
        if (!best) {
          throw new NotFoundError(`Nessun anime trovato per "${input.title}"`);
        }
        const detail = await catalog.getBySlug(best.slug);
        return toEntry(detail.id, detail.slug, detail.titleIta ?? detail.title);
      }

      throw new NotFoundError('Richiesta non risolvibile: nessun identificatore valido');
    },
  };
}
