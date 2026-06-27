import type { JellyfinTestResult } from '@animeunion/shared';
import { request } from 'undici';
import type { Logger } from '../lib/logger';
import type { ConfigService } from './config-service';

// Debounce del refresh: su una coda gigante (One Piece) non si chiama Jellyfin a ogni episodio.
const REFRESH_DEBOUNCE_MS = 60_000;

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export interface JellyfinService {
  /** Prova la connessione (System/Info). Con override usa URL/chiave digitati (bozza non salvata). */
  testConnection(opts?: { serverUrl?: string; apiKey?: string }): Promise<JellyfinTestResult>;
  /** Chiede a Jellyfin una scansione della libreria. Best-effort + debounce; non lancia mai. */
  refresh(): Promise<void>;
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
  // -Infinity: il primo refresh parte sempre, indipendentemente dal clock (anche se now()===0).
  let lastRefreshAt = Number.NEGATIVE_INFINITY;

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

    async refresh() {
      const serverUrl = normalizeBase(config.get('jellyfinServerUrl'));
      const apiKey = config.get('jellyfinApiKey').trim();
      if (!serverUrl || !apiKey) {
        return;
      }
      const ts = now();
      if (ts - lastRefreshAt < REFRESH_DEBOUNCE_MS) {
        return;
      }
      lastRefreshAt = ts;
      try {
        const res = await request(`${serverUrl}/Library/Refresh`, {
          method: 'POST',
          headers: { 'X-Emby-Token': apiKey },
        });
        await res.body.dump();
        if (res.statusCode >= 400) {
          logger.debug({ status: res.statusCode }, 'Jellyfin refresh: risposta non ok');
        }
      } catch (err) {
        logger.debug({ err }, 'Jellyfin refresh best-effort fallito');
      }
    },
  };
}
