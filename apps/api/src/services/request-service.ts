import type {
  AnimeSummary,
  Language,
  RequestInput,
  RequestResult,
  RequestStatus,
} from '@animeunion/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import { NotFoundError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import type { CatalogService } from './catalog-service';
import type { ConfigService } from './config-service';
import type { DownloadService } from './download-service';
import type { FollowService } from './follow-service';
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
  /**
   * Esegue la richiesta su una entry risolta: segue l'anime (watching + auto-download) e, se
   * richiesto, accoda gli episodi gia disponibili (Regola #13: solo la stessa entry).
   */
  fulfill(
    entry: ResolvedEntry,
    opts: { language?: Language; download: boolean },
  ): Promise<RequestResult>;
  /** resolve + fulfill: punto d'ingresso unico per la rotta REST. */
  handle(input: RequestInput): Promise<RequestResult>;
  /** Stato di disponibilita locale (episodi scaricati vs totali in cache) per uno slug. */
  availability(slug: string): RequestStatus;
}

export interface RequestServiceDeps {
  db: Db;
  catalog: CatalogService;
  resolver: SeriesResolver;
  follow: FollowService;
  download: DownloadService;
  config: ConfigService;
  logger?: Logger;
}

export function createRequestService(deps: RequestServiceDeps): RequestService {
  const { db, catalog, resolver, follow, download, config } = deps;

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

  async function resolve(input: RequestInput): Promise<ResolvedEntry> {
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
  }

  async function fulfill(
    entry: ResolvedEntry,
    opts: { language?: Language; download: boolean },
  ): Promise<RequestResult> {
    // Download prima del follow: se le cartelle non sono configurate, addAllBySlug lancia
    // PreconditionError e non lasciamo un follow "orfano" come effetto collaterale.
    let enqueued = 0;
    if (opts.download) {
      const language = opts.language ?? config.get('language');
      enqueued = await download.addAllBySlug({ slug: entry.slug, language });
    }
    const alreadyFollowed = follow.list().some((f) => f.animeId === entry.animeId);
    follow.add({ animeId: entry.animeId, status: 'watching', autoDownload: true });
    return {
      ok: true,
      animeId: entry.animeId,
      slug: entry.slug,
      title: entry.title,
      seasonNumber: entry.seasonNumber,
      status: alreadyFollowed ? 'already' : 'followed',
      enqueued,
    };
  }

  async function handle(input: RequestInput): Promise<RequestResult> {
    const entry = await resolve(input);
    return fulfill(entry, { language: input.language, download: input.download });
  }

  function availability(slug: string): RequestStatus {
    const animeRow = db
      .select({ id: schema.anime.id })
      .from(schema.anime)
      .where(eq(schema.anime.slug, slug))
      .get();
    if (!animeRow) {
      throw new NotFoundError(`Anime non in cache: ${slug}. Invia prima una richiesta.`);
    }
    const rows = db
      .select({ status: schema.episodeFile.downloadStatus })
      .from(schema.episodeFile)
      .innerJoin(schema.episode, eq(schema.episodeFile.episodeId, schema.episode.id))
      .where(eq(schema.episode.animeId, animeRow.id))
      .all();
    const total = rows.length;
    // `external` (collegato senza scaricare) e' disponibile quanto un download.
    const downloaded = rows.filter(
      (r) => r.status === 'downloaded' || r.status === 'external',
    ).length;
    return { slug, total, downloaded, pending: total - downloaded };
  }

  return { resolve, fulfill, handle, availability };
}
