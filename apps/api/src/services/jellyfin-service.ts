import { basename } from 'node:path';
import type { JellyfinTestResult } from '@animeunion/shared';
import { request } from 'undici';
import type { Logger } from '../lib/logger';
import type { ConfigService } from './config-service';

// Debounce del refresh: su una coda gigante (One Piece) non si chiama Jellyfin a ogni episodio.
// La finestra è per-libreria (vedi lastRefreshAt) così un film non blocca il refresh di una serie.
const REFRESH_DEBOUNCE_MS = 60_000;
// Le librerie Jellyfin cambiano di rado: cache la mappatura path→libreria per non interrogare
// /Library/VirtualFolders ad ogni download.
const VFOLDERS_TTL_MS = 5 * 60_000;

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

interface JellyfinVirtualFolder {
  Name?: string;
  ItemId?: string;
  Locations?: string[];
}

export interface JellyfinService {
  /** Prova la connessione (System/Info). Con override usa URL/chiave digitati (bozza non salvata). */
  testConnection(opts?: { serverUrl?: string; apiKey?: string }): Promise<JellyfinTestResult>;
  /**
   * Chiede a Jellyfin una scansione. Best-effort + debounce; non lancia mai.
   * Con `targetPath` (il file appena scaricato) rinfresca SOLO la libreria che contiene quel path
   * (`POST /Items/{id}/Refresh`) invece dell'intera libreria: evita di far scandire a Jellyfin tutto
   * l'HDD ad ogni download, che sull'HDD meccanico condiviso satura l'I/O e rallenta i download.
   * Fallback alla scansione globale (`/Library/Refresh`) solo quando la libreria non è determinabile
   * (nessun path, o /Library/VirtualFolders non raggiungibile).
   */
  refresh(opts?: { targetPath?: string | null }): Promise<void>;
}

export interface JellyfinServiceDeps {
  config: ConfigService;
  logger: Logger;
  /** Iniettabile nei test per controllare il debounce. */
  now?: () => number;
}

export function createJellyfinService(deps: JellyfinServiceDeps): JellyfinService {
  const { config, logger } = deps;
  const now = deps.now ?? (() => Date.now());
  // Debounce per-libreria (chiave = ItemId della libreria, o '__global__' per il fallback globale).
  const lastRefreshAt = new Map<string, number>();
  let vfoldersCache: { fetchedAt: number; folders: JellyfinVirtualFolder[] } | null = null;

  async function getVirtualFolders(
    serverUrl: string,
    apiKey: string,
  ): Promise<JellyfinVirtualFolder[] | null> {
    if (vfoldersCache && now() - vfoldersCache.fetchedAt < VFOLDERS_TTL_MS) {
      return vfoldersCache.folders;
    }
    try {
      const res = await request(`${serverUrl}/Library/VirtualFolders`, {
        method: 'GET',
        headers: { 'X-Emby-Token': apiKey },
      });
      if (res.statusCode !== 200) {
        await res.body.dump();
        return null;
      }
      const folders = (await res.body.json()) as JellyfinVirtualFolder[];
      vfoldersCache = { fetchedAt: now(), folders };
      return folders;
    } catch (err) {
      logger.debug({ err }, 'Jellyfin VirtualFolders non raggiungibile');
      return null;
    }
  }

  // I path lato Jellyfin (es. /media/Media/Video/Anime) differiscono dai nostri (es. /media/Anime):
  // il prefisso di mount cambia, ma la cartella finale (basename) è la stessa perché punta allo
  // stesso volume fisico. Match per segmento di path esatto: la libreria vince se il basename della
  // sua location compare come segmento del targetPath (il più lungo vince: "Anime Movie" > "Anime").
  function resolveLibraryId(folders: JellyfinVirtualFolder[], targetPath: string): string | null {
    const segments = new Set(targetPath.split(/[\\/]+/).filter(Boolean));
    let best: { id: string; len: number } | null = null;
    for (const folder of folders) {
      if (!folder.ItemId || !folder.Locations) {
        continue;
      }
      for (const location of folder.Locations) {
        const name = basename(location);
        if (name && segments.has(name) && (!best || name.length > best.len)) {
          best = { id: folder.ItemId, len: name.length };
        }
      }
    }
    return best?.id ?? null;
  }

  return {
    async testConnection(opts) {
      const serverUrl = normalizeBase(opts?.serverUrl ?? config.get('jellyfinServerUrl'));
      const apiKey = (opts?.apiKey ?? config.get('jellyfinApiKey')).trim();
      if (!serverUrl || !apiKey) {
        return { ok: false, error: 'URL del server o API key mancanti.' };
      }
      try {
        const res = await request(`${serverUrl}/System/Info`, {
          method: 'GET',
          headers: { 'X-Emby-Token': apiKey },
        });
        if (res.statusCode === 401) {
          await res.body.dump();
          return { ok: false, error: 'API key non valida (401).' };
        }
        if (res.statusCode !== 200) {
          await res.body.dump();
          return { ok: false, error: `Risposta inattesa dal server (${res.statusCode}).` };
        }
        const info = (await res.body.json()) as { ServerName?: string; Version?: string };
        return { ok: true, serverName: info.ServerName, version: info.Version };
      } catch (err) {
        logger.debug({ err }, 'Jellyfin testConnection fallito');
        return { ok: false, error: 'Server non raggiungibile.' };
      }
    },

    async refresh(opts) {
      const serverUrl = normalizeBase(config.get('jellyfinServerUrl'));
      const apiKey = config.get('jellyfinApiKey').trim();
      if (!serverUrl || !apiKey) {
        return;
      }

      // Determina la libreria bersaglio dal path del file scaricato.
      let libraryId: string | null = null;
      const targetPath = opts?.targetPath ?? null;
      if (targetPath) {
        const folders = await getVirtualFolders(serverUrl, apiKey);
        if (folders) {
          libraryId = resolveLibraryId(folders, targetPath);
          if (!libraryId) {
            // Path noto ma non coperto da alcuna libreria Jellyfin (es. cartella DUB non aggiunta):
            // una scansione globale non lo farebbe comparire comunque → niente refresh, niente I/O.
            logger.debug({ targetPath }, 'Jellyfin: nessuna libreria per il path, refresh saltato');
            return;
          }
        }
        // folders === null: VirtualFolders non raggiungibile → cade nel refresh globale (best-effort).
      }

      const key = libraryId ?? '__global__';
      const ts = now();
      const last = lastRefreshAt.get(key) ?? Number.NEGATIVE_INFINITY;
      if (ts - last < REFRESH_DEBOUNCE_MS) {
        return;
      }
      lastRefreshAt.set(key, ts);

      // Refresh mirato per libreria, altrimenti fallback globale.
      const url = libraryId
        ? `${serverUrl}/Items/${libraryId}/Refresh?Recursive=true&metadataRefreshMode=Default&imageRefreshMode=Default`
        : `${serverUrl}/Library/Refresh`;
      try {
        const res = await request(url, {
          method: 'POST',
          headers: { 'X-Emby-Token': apiKey },
        });
        await res.body.dump();
        if (res.statusCode >= 400) {
          logger.debug({ status: res.statusCode, libraryId }, 'Jellyfin refresh: risposta non ok');
        }
      } catch (err) {
        logger.debug({ err }, 'Jellyfin refresh best-effort fallito');
      }
    },
  };
}
