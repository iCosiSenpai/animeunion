import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { GoogleBackupResult, GoogleDriveStatus } from '@animeunion/shared';
import { fetch as undiciFetch } from 'undici';
import { PreconditionError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import type { ConfigService } from './config-service';
import type { DbBackupService } from './db-backup-service';

// Endpoint OAuth2 + Drive v3. Client "Desktop" bring-your-own dell'utente, scope `drive.file`
// (solo i file creati dall'app): niente accesso al resto del Drive, nessuna verifica Google.
const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FOLDER_NAME = 'AnimeUnion Backups';
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
// Rinnova l'access token un minuto prima della scadenza dichiarata (margine di clock skew).
const ACCESS_TOKEN_SKEW_MS = 60 * 1000;

export interface CloudBackupService {
  /** Stato del collegamento (sync: legge config + cache in memoria di last upload/errore). */
  getStatus(): GoogleDriveStatus;
  /** URL di consenso OAuth da aprire nel browser. Richiede clientId/secret configurati. */
  buildAuthUrl(): string;
  /** Scambia il `code` incollato dall'utente per un refresh token (salvato cifrato). */
  exchangeCode(code: string): Promise<void>;
  /** Scollega Drive: azzera refresh token e id cartella. */
  disconnect(): void;
  /** Carica il backup locale più recente su Drive + prune oltre la retention. Best-effort. */
  uploadLatestBackup(): Promise<GoogleBackupResult>;
}

export interface CloudBackupDeps {
  config: ConfigService;
  backup: DbBackupService;
  logger: Logger;
}

/** Tronca un dettaglio di errore remoto per non riversare payload enormi nei log/UI. */
function truncate(text: string, max = 200): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function createCloudBackupService(deps: CloudBackupDeps): CloudBackupService {
  const { config, backup, logger } = deps;

  // Stato volatile (Regola #1: niente tabella nuova). Si azzera al riavvio.
  let lastUploadAt: string | null = null;
  let lastUploadName: string | null = null;
  let lastError: string | null = null;
  let accessToken: { token: string; expiresAt: number } | null = null;

  function requireClient(): { clientId: string; clientSecret: string; redirectUri: string } {
    const clientId = config.get('gdriveClientId').trim();
    const clientSecret = config.get('gdriveClientSecret').trim();
    if (!clientId || !clientSecret) {
      throw new PreconditionError(
        'Client OAuth Google non configurato: inserisci Client ID e Client Secret.',
      );
    }
    const redirectUri = config.get('gdriveRedirectUri').trim() || 'http://127.0.0.1';
    return { clientId, clientSecret, redirectUri };
  }

  async function getAccessToken(): Promise<string> {
    if (accessToken && accessToken.expiresAt > Date.now()) {
      return accessToken.token;
    }
    const { clientId, clientSecret } = requireClient();
    const refreshToken = config.get('gdriveRefreshToken').trim();
    if (!refreshToken) {
      throw new PreconditionError("Google Drive non collegato: autorizza prima l'accesso.");
    }
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    const res = await undiciFetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `Refresh del token Google rifiutato (HTTP ${res.status}). ${truncate(detail)}`,
      );
    }
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) {
      throw new Error('Google non ha restituito un access token.');
    }
    accessToken = {
      token: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 - ACCESS_TOKEN_SKEW_MS,
    };
    return accessToken.token;
  }

  /** Assicura la cartella Drive dell'app: la crea al primo upload e ne salva l'id. */
  async function ensureFolder(token: string): Promise<string> {
    const existing = config.get('gdriveFolderId').trim();
    if (existing) {
      return existing;
    }
    const res = await undiciFetch(`${DRIVE_FILES_URL}?fields=id`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: DRIVE_FOLDER_MIME }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Creazione cartella Drive fallita (HTTP ${res.status}). ${truncate(detail)}`);
    }
    const json = (await res.json()) as { id?: string };
    if (!json.id) {
      throw new Error("Drive non ha restituito l'id della cartella.");
    }
    config.set('gdriveFolderId', json.id);
    return json.id;
  }

  /** Upload multipart/related: metadata JSON + bytes del .db in un'unica richiesta. */
  async function uploadFile(
    token: string,
    folderId: string,
    name: string,
    data: Buffer,
  ): Promise<void> {
    const boundary = `aunion${randomUUID()}`;
    const metadata = JSON.stringify({ name, parents: [folderId] });
    const head =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`;
    const tail = `\r\n--${boundary}--`;
    const payload = Buffer.concat([Buffer.from(head, 'utf8'), data, Buffer.from(tail, 'utf8')]);
    const res = await undiciFetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/related; boundary=${boundary}`,
      },
      body: payload,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Upload su Drive fallito (HTTP ${res.status}). ${truncate(detail)}`);
    }
  }

  /** Mantiene solo i `retention` file più recenti nella cartella Drive. Best-effort. */
  async function pruneRemote(token: string, folderId: string, retention: number): Promise<void> {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const url = `${DRIVE_FILES_URL}?q=${q}&orderBy=createdTime desc&fields=files(id,name)&pageSize=100`;
    const res = await undiciFetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) {
      logger.debug({ status: res.status }, 'Prune Drive: lista file fallita (ignorata)');
      return;
    }
    const json = (await res.json()) as { files?: Array<{ id: string }> };
    const extra = (json.files ?? []).slice(Math.max(0, retention));
    for (const file of extra) {
      await undiciFetch(`${DRIVE_FILES_URL}/${file.id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      }).catch((error) => {
        logger.debug({ err: error, id: file.id }, 'Prune Drive: delete fallito (ignorato)');
      });
    }
  }

  return {
    getStatus(): GoogleDriveStatus {
      const clientId = config.get('gdriveClientId').trim();
      const clientSecret = config.get('gdriveClientSecret').trim();
      return {
        connected: config.get('gdriveRefreshToken').trim() !== '',
        enabled: config.get('gdriveEnabled'),
        clientConfigured: clientId !== '' && clientSecret !== '',
        folderConfigured: config.get('gdriveFolderId').trim() !== '',
        lastUploadAt,
        lastUploadName,
        lastError,
      };
    },

    buildAuthUrl(): string {
      const { clientId, redirectUri } = requireClient();
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: DRIVE_SCOPE,
        access_type: 'offline',
        // Forza il consenso così Google restituisce SEMPRE un refresh token (senza, dopo la prima
        // autorizzazione ne restituirebbe solo l'access token e resteremmo senza refresh).
        prompt: 'consent',
      });
      return `${OAUTH_AUTH_URL}?${params.toString()}`;
    },

    async exchangeCode(code: string): Promise<void> {
      const { clientId, clientSecret, redirectUri } = requireClient();
      const body = new URLSearchParams({
        code: code.trim(),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      });
      const res = await undiciFetch(OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new PreconditionError(
          `Google ha rifiutato il codice (HTTP ${res.status}). ${truncate(detail)}`,
        );
      }
      const json = (await res.json()) as {
        refresh_token?: string;
        access_token?: string;
        expires_in?: number;
      };
      if (!json.refresh_token) {
        throw new PreconditionError(
          "Google non ha restituito un refresh token. Revoca l'accesso dell'app dal tuo account Google e riprova.",
        );
      }
      // config.set cifra i secret a riposo (AUTH_ENCRYPT_KEY).
      config.set('gdriveRefreshToken', json.refresh_token);
      if (json.access_token) {
        accessToken = {
          token: json.access_token,
          expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 - ACCESS_TOKEN_SKEW_MS,
        };
      }
      lastError = null;
    },

    disconnect(): void {
      config.set('gdriveRefreshToken', '');
      config.set('gdriveFolderId', '');
      accessToken = null;
      lastError = null;
    },

    async uploadLatestBackup(): Promise<GoogleBackupResult> {
      if (!config.get('gdriveEnabled')) {
        throw new PreconditionError('Backup su Google Drive non abilitato.');
      }
      if (config.get('gdriveRefreshToken').trim() === '') {
        throw new PreconditionError('Google Drive non collegato: autorizza prima.');
      }
      try {
        const latest = await backup.latestBackupPath();
        if (!latest) {
          throw new PreconditionError('Nessun backup locale da caricare: esegui prima un backup.');
        }
        const data = await readFile(latest.path);
        const token = await getAccessToken();
        const folderId = await ensureFolder(token);
        await uploadFile(token, folderId, latest.name, data);
        await pruneRemote(token, folderId, config.get('gdriveRetention'));
        lastUploadAt = new Date().toISOString();
        lastUploadName = latest.name;
        lastError = null;
        logger.info({ name: latest.name }, 'Backup caricato su Google Drive');
        return { ok: true, name: latest.name };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        logger.warn({ err: error }, 'Upload backup su Google Drive fallito');
        throw error;
      }
    },
  };
}
