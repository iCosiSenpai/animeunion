import { join } from 'node:path';
import type { Language } from '@animeunion/shared';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import { pad2, sanitizeSlugForFs } from '../lib/download-fs';
import type { SeriesInfo } from './series-resolver';
import { type SeriesResolver, createSeriesResolver } from './series-resolver';

export interface RenamerService {
  computeEpisodePath(input: {
    animeId: string;
    episodeNumber: number;
    language: Language;
    animePath: string;
  }): string;
}

export interface RenamerServiceDeps {
  db: Db;
  seriesResolver?: SeriesResolver;
}

export function createRenamerService(deps: RenamerServiceDeps): RenamerService {
  const { db } = deps;
  const resolver = deps.seriesResolver ?? createSeriesResolver({ db });

  function languageFolder(language: Language): string {
    return language.toLowerCase().replace(/_/g, '-');
  }

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

  return {
    computeEpisodePath({ animeId, episodeNumber, language, animePath }) {
      const series = resolver.resolve(animeId);
      const seasonNumber = series.seasonNumber;
      const displayNumber = relativeEpisodeNumber(series, episodeNumber);
      const dir = join(
        animePath,
        languageFolder(language),
        sanitizeSlugForFs(series.seriesSlug),
        `Season ${pad2(seasonNumber)}`,
      );
      const file = `S${pad2(seasonNumber)}E${pad2(displayNumber)}.mp4`;
      return join(dir, file);
    },
  };
}
