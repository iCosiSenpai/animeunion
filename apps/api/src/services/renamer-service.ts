import { join } from 'node:path';
import type { Language, Quality } from '@animeunion/shared';
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
    // Default 'SD': il percorso della sorgente resta invariato. Le upscalate (XQ/XQPLUS) prendono
    // un tag qualita' nel nome file, cosi' non sovrascrivono la sorgente SD.
    quality?: Quality;
  }): string;
  /**
   * Calcola il percorso che AVREBBE l'episodio con i parametri di override passati, senza
   * leggere l'override salvato. Usato per l'anteprima nel dialog "Classifica e scarica".
   */
  previewPath(input: {
    animeId: string;
    episodeNumber: number;
    language: Language;
    quality?: Quality;
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

// Suffisso qualita' nel nome file: vuoto per la sorgente SD (percorso invariato), tag tra parentesi
// per le upscalate cosi' convivono con la sorgente nella stessa cartella senza sovrascriverla.
function qualityTag(quality: Quality): string {
  return quality === 'SD' ? '' : ` [${quality}]`;
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

  /**
   * Episodi delle PARTI precedenti della stessa stagione (es. War of Underworld part 1)
   * per dare numerazione continua alla parte corrente. NULL part_number conta come 1.
   */
  function previousPartsEpisodeCount(series: SeriesInfo): number {
    if (series.partNumber <= 1) {
      return 0;
    }
    // 1) Parti precedenti con override esplicito sulla stessa (serie madre, stagione).
    const overrideRows = db
      .select({
        animeId: schema.seriesOverride.animeId,
        episodeCount: schema.anime.episodeCount,
      })
      .from(schema.seriesOverride)
      .innerJoin(schema.anime, eq(schema.anime.id, schema.seriesOverride.animeId))
      .where(
        and(
          eq(schema.seriesOverride.seriesAnimeId, series.seriesId),
          eq(schema.seriesOverride.seasonNumber, series.seasonNumber),
          sql`COALESCE(${schema.seriesOverride.partNumber}, 1) < ${series.partNumber}`,
        ),
      )
      .all();
    const counted = new Set<string>();
    let total = 0;
    for (const row of overrideRows) {
      if (row.episodeCount && row.episodeCount > 0 && !counted.has(row.animeId)) {
        counted.add(row.animeId);
        total += row.episodeCount;
      }
    }
    // 2) La serie base/root e' implicitamente la PARTE 1 quando la stagione corrente coincide con
    //    la sua (caso "Sakamoto Days": la prima parte e' la serie base, senza riga di override ->
    //    senza questo l'offset sarebbe 0 e la parte 2 ripartirebbe da E01). Per una stagione divisa
    //    non-root (es. "War of Underworld" = season 4) la root sta su un'altra stagione e NON va
    //    contata: ci pensano gli override delle singole parti.
    const base = db
      .select({
        id: schema.anime.id,
        seasonNumber: schema.anime.seasonNumber,
        episodeCount: schema.anime.episodeCount,
      })
      .from(schema.anime)
      .where(eq(schema.anime.id, series.seriesId))
      .get();
    if (
      base &&
      !counted.has(base.id) &&
      (base.seasonNumber ?? 1) === series.seasonNumber &&
      base.episodeCount &&
      base.episodeCount > 0
    ) {
      total += base.episodeCount;
    }
    return total;
  }

  function relativeEpisodeNumber(series: SeriesInfo, episodeNumber: number): number {
    // 1) Numerazione assoluta -> relativa di stagione (stagioni precedenti dello stesso franchise).
    let n = episodeNumber;
    if (series.seasonNumber > 1) {
      const previous = previousSeasonsEpisodeCount(series);
      if (previous > 0) {
        const relative = episodeNumber - previous;
        n = relative > 0 ? relative : episodeNumber;
      }
    }
    // 2) Stagione divisa in parti: offset additivo per numerazione continua. Si applica solo
    //    se la parte riparte da capo (n <= episodi della/e parte/i precedente/i); se l'entry
    //    e' gia' continua (n maggiore dell'offset) non si tocca.
    if (series.partNumber > 1) {
      const prevParts = previousPartsEpisodeCount(series);
      if (prevParts > 0 && n <= prevParts) {
        n += prevParts;
      }
    }
    return n;
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
    quality: Quality,
  ): string {
    const isMovie = series.kind === 'movie';
    const root = config.resolveDownloadRoot(isMovie, language);

    // Suffisso lingua nel nome SOLO se SUB e DUB finiscono nella stessa cartella radice
    // (così convivono); se l'utente ha cartelle separate, nome pulito.
    const otherLang: Language = language === 'DUB_ITA' ? 'SUB_ITA' : 'DUB_ITA';
    const sameRoot = config.resolveDownloadRoot(isMovie, otherLang) === root;
    const tag = sameRoot ? ` - ${languageTag(language)}` : '';
    const qTag = qualityTag(quality);

    if (isMovie) {
      // Film: cartella propria con il titolo dell'entry (layout Jellyfin per i film).
      const title = sanitizeTitleForFs(titleOf(animeId));
      return join(root, title, `${title}${tag}${qTag}.mp4`);
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
    const file = `${title} - S${pad2(seasonNumber)}E${pad2(displayNumber)}${tag}${qTag}.mp4`;
    return join(dir, file);
  }

  return {
    computeEpisodePath({ animeId, episodeNumber, language, quality = 'SD' }) {
      return pathFor(animeId, episodeNumber, language, resolver.resolve(animeId), quality);
    },

    previewPath({ animeId, episodeNumber, language, quality = 'SD', override }) {
      const series = override ? resolver.resolveWith(animeId, override) : resolver.resolve(animeId);
      return pathFor(animeId, episodeNumber, language, series, quality);
    },
  };
}
