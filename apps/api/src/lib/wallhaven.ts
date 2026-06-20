import type { Wallpaper } from '@animeunion/shared';
import { request } from 'undici';
import type { Logger } from './logger';

interface WallhavenItem {
  id: string;
  url: string;
  resolution: string;
  path: string;
  thumbs?: { large?: string; small?: string; original?: string };
}

/**
 * Cerca anime wallpaper su wallhaven.cc (categoria Anime, SOLO SFW, niente API key).
 * Best-effort: ritorna [] su errore. Query vuota = toplist (popolari).
 */
export async function searchWallpapers(query?: string, logger?: Logger): Promise<Wallpaper[]> {
  const q = query?.trim();
  const params = new URLSearchParams({
    categories: '010', // solo Anime
    purity: '100', // solo SFW
    sorting: q ? 'relevance' : 'toplist',
    page: '1',
  });
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
    }));
  } catch (error) {
    logger?.debug({ err: error }, 'wallhaven: errore di rete');
    return [];
  }
}
