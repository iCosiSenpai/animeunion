import { join } from 'node:path';
import type { Language } from '@animeunion/shared';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import { pad2, sanitizeTitleForFs } from '../lib/download-fs';
import type { ConfigService } from './config-service';
import type { SeriesInfo } from './series-resolver';
import { type SeriesResolver, createSeriesResolver } from './series-resolver';

export interface RenamerService {
  computeEpisodePath(input: {
    animeId: string;
    episodeNumber: number;
    language: Language;
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

  function titleOf(animeId: string): { title: string; isMovie: boolean } {
    const anime = db.select().from(schema.anime).where(eq(schema.anime.id, animeId)).get();
    return {
      title: anime?.titleIta ?? anime?.title ?? animeId,
      isMovie: anime?.type === 'MOVIE',
    };
  }

  return {
    computeEpisodePath({ animeId, episodeNumber, language }) {
      const { isMovie } = titleOf(animeId);
      const root = config.resolveDownloadRoot(isMovie, language);

      // Suffisso lingua nel nome SOLO se SUB e DUB finiscono nella stessa cartella radice
      // (così convivono); se l'utente ha cartelle separate, nome pulito.
      const otherLang: Language = language === 'DUB_ITA' ? 'SUB_ITA' : 'DUB_ITA';
      const sameRoot = config.resolveDownloadRoot(isMovie, otherLang) === root;
      const tag = sameRoot ? ` - ${languageTag(language)}` : '';

      if (isMovie) {
        const title = sanitizeTitleForFs(titleOf(animeId).title);
        return join(root, title, `${title}${tag}.mp4`);
      }

      // Serie: cartella del franchise (titolo della stagione "root") + Season NN.
      const series = resolver.resolve(animeId);
      const rootAnime = db
        .select({ title: schema.anime.title, titleIta: schema.anime.titleIta })
        .from(schema.anime)
        .where(eq(schema.anime.slug, series.seriesSlug))
        .get();
      const title = sanitizeTitleForFs(
        rootAnime?.titleIta ?? rootAnime?.title ?? titleOf(animeId).title,
      );
      const seasonNumber = series.seasonNumber;
      const displayNumber = relativeEpisodeNumber(series, episodeNumber);
      const dir = join(root, title, `Season ${pad2(seasonNumber)}`);
      const file = `${title} - S${pad2(seasonNumber)}E${pad2(displayNumber)}${tag}.mp4`;
      return join(dir, file);
    },
  };
}
