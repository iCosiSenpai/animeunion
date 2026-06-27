import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { request } from 'undici';
import type { Db } from '../db';
import { schema } from '../db';
import type { Logger } from '../lib/logger';
import type { ConfigService } from './config-service';
import { loadGenresByAnimeIds } from './mappers';

/** Escape dei caratteri speciali XML. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

export interface TvshowNfoInput {
  title: string;
  originalTitle?: string;
  plot?: string;
  studio?: string;
  /** Voto già riscalato a 0-10. */
  rating?: number;
  genres: string[];
  malId?: number;
  anilistId?: number;
}

/** NFO della serie (cartella radice). Mappa i metadati anime allo standard Kodi/Jellyfin. */
export function buildTvshowNfo(a: TvshowNfoInput): string {
  const lines = [XML_HEADER, '<tvshow>', `  <title>${esc(a.title)}</title>`];
  if (a.originalTitle) {
    lines.push(`  <originaltitle>${esc(a.originalTitle)}</originaltitle>`);
  }
  if (a.plot) {
    lines.push(`  <plot>${esc(a.plot)}</plot>`);
  }
  if (a.studio) {
    lines.push(`  <studio>${esc(a.studio)}</studio>`);
  }
  if (a.rating != null) {
    lines.push(`  <rating>${a.rating.toFixed(1)}</rating>`);
  }
  for (const g of a.genres) {
    lines.push(`  <genre>${esc(g)}</genre>`);
  }
  if (a.anilistId != null) {
    lines.push(`  <uniqueid type="anilist" default="true">${a.anilistId}</uniqueid>`);
  }
  if (a.malId != null) {
    const def = a.anilistId == null ? ' default="true"' : '';
    lines.push(`  <uniqueid type="mal"${def}>${a.malId}</uniqueid>`);
  }
  lines.push('</tvshow>', '');
  return lines.join('\n');
}

/** NFO della stagione (cartella Season NN / Specials). */
export function buildSeasonNfo(seasonNumber: number): string {
  return [
    XML_HEADER,
    '<season>',
    `  <seasonnumber>${seasonNumber}</seasonnumber>`,
    '</season>',
    '',
  ].join('\n');
}

export interface EpisodeNfoInput {
  title?: string;
  season: number;
  episode: number;
  aired?: string;
}

/** NFO del singolo episodio (accanto al file video). */
export function buildEpisodeNfo(e: EpisodeNfoInput): string {
  const lines = [
    XML_HEADER,
    '<episodedetails>',
    `  <title>${esc(e.title ?? `Episodio ${e.episode}`)}</title>`,
    `  <season>${e.season}</season>`,
    `  <episode>${e.episode}</episode>`,
  ];
  if (e.aired) {
    lines.push(`  <aired>${esc(e.aired)}</aired>`);
  }
  lines.push('</episodedetails>', '');
  return lines.join('\n');
}

export interface NfoService {
  /**
   * Best-effort: scrive i sidecar NFO (tvshow/season/episodio) + artwork (poster/fanart) accanto al
   * video appena scaricato, attingendo ai metadati in DB. Non lancia mai: un errore I/O o un server
   * immagini giù non deve interrompere il flusso di download.
   */
  writeForEpisodeFile(episodeFileId: string): Promise<void>;
}

export interface NfoServiceDeps {
  db: Db;
  config: ConfigService;
  logger: Logger;
}

export function createNfoService(deps: NfoServiceDeps): NfoService {
  const { db, config, logger } = deps;

  async function downloadIfMissing(url: string | null, dest: string): Promise<void> {
    if (!url || existsSync(dest)) {
      return;
    }
    try {
      const res = await request(url);
      if (res.statusCode !== 200) {
        await res.body.dump();
        return;
      }
      const buf = Buffer.from(await res.body.arrayBuffer());
      await writeFile(dest, buf);
    } catch (err) {
      logger.debug({ err, dest }, 'Download artwork NFO best-effort fallito');
    }
  }

  return {
    async writeForEpisodeFile(episodeFileId) {
      try {
        if (!config.get('writeNfo')) {
          return;
        }
        const row = db
          .select({
            localPath: schema.episodeFile.localPath,
            episodeNumber: schema.episode.number,
            episodeTitle: schema.episode.title,
            episodeTitleIta: schema.episode.titleIta,
            airDate: schema.episode.airDate,
            animeId: schema.anime.id,
            animeTitle: schema.anime.title,
            animeTitleIta: schema.anime.titleIta,
            synopsis: schema.anime.synopsis,
            studio: schema.anime.studio,
            score: schema.anime.score,
            malId: schema.anime.malId,
            anilistId: schema.anime.anilistId,
            seasonNumber: schema.anime.seasonNumber,
            coverImage: schema.anime.coverImage,
            bannerImage: schema.anime.bannerImage,
          })
          .from(schema.episodeFile)
          .innerJoin(schema.episode, eq(schema.episode.id, schema.episodeFile.episodeId))
          .innerJoin(schema.anime, eq(schema.anime.id, schema.episode.animeId))
          .where(eq(schema.episodeFile.id, episodeFileId))
          .get();
        if (!row?.localPath) {
          return;
        }
        const localPath = row.localPath;
        const seasonFolder = dirname(localPath);
        const seasonBase = basename(seasonFolder);
        const isSpecials = /^specials?$/i.test(seasonBase);
        const isSeasonLayout = /^(?:season|stagione)\s*\d+$/i.test(seasonBase) || isSpecials;
        // Film: il file sta direttamente nella cartella della serie (niente Season NN).
        const seriesFolder = isSeasonLayout ? dirname(seasonFolder) : seasonFolder;

        // Numeri dal nome file (SxxEyy = coerenti col file su disco), con fallback ai dati DB.
        const se = basename(localPath).match(/s(\d{1,3})e(\d{1,4})/i);
        const seasonNumber = se?.[1] ? Number(se[1]) : isSpecials ? 0 : (row.seasonNumber ?? 1);
        const episodeNumber = se?.[2] ? Number(se[2]) : row.episodeNumber;

        const genres =
          loadGenresByAnimeIds(db, [row.animeId])
            .get(row.animeId)
            ?.map((g) => g.name) ?? [];
        const rating = row.score != null ? row.score / 10 : undefined;

        // episodio: riscritto sempre (metadati del singolo file).
        const epNfoPath = localPath.replace(/\.[^.]+$/, '.nfo');
        await writeFile(
          epNfoPath,
          buildEpisodeNfo({
            title: row.episodeTitleIta ?? row.episodeTitle ?? undefined,
            season: seasonNumber,
            episode: episodeNumber,
            aired: row.airDate ?? undefined,
          }),
        );

        // stagione: solo nel layout a stagioni e se assente.
        if (isSeasonLayout) {
          const seasonNfoPath = join(seasonFolder, 'season.nfo');
          if (!existsSync(seasonNfoPath)) {
            await writeFile(seasonNfoPath, buildSeasonNfo(seasonNumber));
          }
        }

        // serie + artwork: solo se assenti (idempotente, non ri-scarica a ogni episodio).
        const tvshowNfoPath = join(seriesFolder, 'tvshow.nfo');
        if (!existsSync(tvshowNfoPath)) {
          await writeFile(
            tvshowNfoPath,
            buildTvshowNfo({
              title: row.animeTitleIta ?? row.animeTitle,
              originalTitle: row.animeTitle,
              plot: row.synopsis ?? undefined,
              studio: row.studio ?? undefined,
              rating,
              genres,
              malId: row.malId ?? undefined,
              anilistId: row.anilistId ?? undefined,
            }),
          );
        }
        await downloadIfMissing(row.coverImage, join(seriesFolder, 'poster.jpg'));
        await downloadIfMissing(row.bannerImage, join(seriesFolder, 'fanart.jpg'));
      } catch (err) {
        logger.debug({ err, episodeFileId }, 'Scrittura NFO best-effort fallita');
      }
    },
  };
}
