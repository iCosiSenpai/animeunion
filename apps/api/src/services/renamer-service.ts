import { join } from 'node:path';
import type { Language } from '@animeunion/shared';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import { pad2, sanitizeTitleForFs } from '../lib/download-fs';
import type { ConfigService } from './config-service';
import type { OverrideParams, SeriesInfo, SeriesResolver } from './series-resolver';
import { createSeriesResolver } from './series-resolver';

export interface RenamerService {
  computeEpisodePath(input: {
    animeId: string;
    episodeNumber: number;
    language: Language;
  }): string;
  /**
   * Calcola il percorso che AVREBBE l'episodio con i parametri di override passati, senza
   * leggere l'override salvato. Usato per l'anteprima nel dialog "Classifica e scarica".
   */
  previewPath(input: {
    animeId: string;
    episodeNumber: number;
    language: Language;
    override?: OverrideParams;
  }): string;
}

export interface RenamerServiceDeps {
  db: Db;
  config: ConfigService;
  seriesResolver?: SeriesResolver;
}

function languageTag(language: Language): string {
  return language === 'DUB_ITA' ? 'DUB ITA' : 'SUB ITA';
}

export function createRenamerService(deps: RenamerServiceDeps): RenamerService {
  const { db, config } = deps;
  const resolver = deps.seriesResolver ?? createSeriesResolver({ db });

  function previousSeasonsEpisodeCount(series: SeriesInfo): number {
    if (series.seasonNumber <= 1) {
      return 0;
    }
    const row = db
      .select({ total: sql<number>`COALESCE(SUM(${schema.anime.episodeCount}), 0)` })
      .from(schema.anime)
      .where(
        and(
          eq(schema.anime.seriesId, series.seriesId),
          lt(schema.anime.seasonNumber, series.seasonNumber),
          sql<number>`${schema.anime.episodeCount} > 0`,
        ),
      )
      .get();
    return row?.total ?? 0;
  }

  function relativeEpisodeNumber(series: SeriesInfo, episodeNumber: number): number {
    if (series.seasonNumber <= 1) {
      return episodeNumber;
    }
    const previous = previousSeasonsEpisodeCount(series);
    if (previous === 0) {
      return episodeNumber;
    }
    const relative = episodeNumber - previous;
    return relative > 0 ? relative : episodeNumber;
  }

  function titleOf(animeId: string): string {
    const anime = db
      .select({ title: schema.anime.title, titleIta: schema.anime.titleIta })
      .from(schema.anime)
      .where(eq(schema.anime.id, animeId))
      .get();
    return anime?.titleIta ?? anime?.title ?? animeId;
  }

  /** Percorso finale per un episodio data la serie/tipo gia' risolti. */
  function pathFor(
    animeId: string,
    episodeNumber: number,
    language: Language,
    series: SeriesInfo,
  ): string {
    const isMovie = series.kind === 'movie';
    const root = config.resolveDownloadRoot(isMovie, language);

    // Suffisso lingua nel nome SOLO se SUB e DUB finiscono nella stessa cartella radice
    // (così convivono); se l'utente ha cartelle separate, nome pulito.
    const otherLang: Language = language === 'DUB_ITA' ? 'SUB_ITA' : 'DUB_ITA';
    const sameRoot = config.resolveDownloadRoot(isMovie, otherLang) === root;
    const tag = sameRoot ? ` - ${languageTag(language)}` : '';

    if (isMovie) {
      // Film: cartella propria con il titolo dell'entry (layout Jellyfin per i film).
      const title = sanitizeTitleForFs(titleOf(animeId));
      return join(root, title, `${title}${tag}.mp4`);
    }

    // Serie: cartella del franchise (titolo della stagione "root") + Season NN.
    const rootAnime = db
      .select({ title: schema.anime.title, titleIta: schema.anime.titleIta })
      .from(schema.anime)
      .where(eq(schema.anime.slug, series.seriesSlug))
      .get();
    const title = sanitizeTitleForFs(rootAnime?.titleIta ?? rootAnime?.title ?? titleOf(animeId));
    const seasonNumber = series.kind === 'special' ? 0 : series.seasonNumber;
    const displayNumber = relativeEpisodeNumber(series, episodeNumber);
    // Stagione 0 = speciali: cartella "Specials" (convenzione Jellyfin), nome file S00EXX.
    const seasonDir = seasonNumber === 0 ? 'Specials' : `Season ${pad2(seasonNumber)}`;
    const dir = join(root, title, seasonDir);
    const file = `${title} - S${pad2(seasonNumber)}E${pad2(displayNumber)}${tag}.mp4`;
    return join(dir, file);
  }

  return {
    computeEpisodePath({ animeId, episodeNumber, language }) {
      return pathFor(animeId, episodeNumber, language, resolver.resolve(animeId));
    },

    previewPath({ animeId, episodeNumber, language, override }) {
      const series = override ? resolver.resolveWith(animeId, override) : resolver.resolve(animeId);
      return pathFor(animeId, episodeNumber, language, series);
    },
  };
}
