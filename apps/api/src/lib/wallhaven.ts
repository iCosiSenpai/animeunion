import type { Wallpaper } from '@animeunion/shared';
import { request } from 'undici';
import type { Logger } from './logger';

interface WallhavenItem {
  id: string;
  url: string;
  resolution: string;
  path: string;
  favorites?: number;
  thumbs?: { large?: string; small?: string; original?: string };
}

export interface WallpaperSearchOptions {
  query?: string;
  /** Aggiunge il purity "sketchy" (artistico) ai risultati SFW. NSFW non supportato (serve API key). */
  sketchy?: boolean;
  /** Scavalca l'ordinamento automatico: `toplist` = "Più votati", `favorites` = "Più amati". */
  sorting?: 'toplist' | 'favorites';
}

/**
 * Cerca anime wallpaper su wallhaven.cc (categoria Anime, niente API key).
 * Purity: SFW di default; con `sketchy` aggiunge i contenuti artistici (110 = SFW+Sketchy).
 * Best-effort: ritorna [] su errore. Ordinamento: `sorting` esplicito, oppure auto
 * (relevance con query, toplist senza).
 */
export async function searchWallpapers(
  opts: WallpaperSearchOptions = {},
  logger?: Logger,
): Promise<Wallpaper[]> {
  const q = opts.query?.trim();
  const sorting = opts.sorting ?? (q ? 'relevance' : 'toplist');
  const params = new URLSearchParams({
    categories: '010', // solo Anime
    purity: opts.sketchy ? '110' : '100', // SFW, oppure SFW + Sketchy (artistico)
    sorting,
    page: '1',
  });
  if (sorting === 'toplist') {
    params.set('topRange', '1y'); // "Più votati" nell'ultimo anno (default wallhaven = 1M)
  }
  if (q) {
    params.set('q', q);
  }

  try {
    const res = await request(`https://wallhaven.cc/api/v1/search?${params.toString()}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    if (res.statusCode >= 400) {
      await res.body.dump().catch(() => {});
      logger?.debug({ status: res.statusCode }, 'wallhaven: ricerca fallita');
      return [];
    }
    const json = (await res.body.json()) as { data?: WallhavenItem[] };
    return (json.data ?? []).slice(0, 24).map((it) => ({
      id: it.id,
      fullUrl: it.path,
      thumbUrl: it.thumbs?.large ?? it.thumbs?.small ?? it.path,
      resolution: it.resolution,
      pageUrl: it.url,
      favorites: it.favorites,
    }));
  } catch (error) {
    logger?.debug({ err: error }, 'wallhaven: errore di rete');
    return [];
  }
}
