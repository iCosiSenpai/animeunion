import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Db, schema } from '../db';
import { createTestDb, testLogger } from '../test/helpers';
import { createCloudBackupService } from './cloud-backup-service';
import { createConfigService } from './config-service';
import type { DbBackupService } from './db-backup-service';

const OAUTH = 'https://oauth2.googleapis.com';
const GAPI = 'https://www.googleapis.com';
const ENCRYPT_KEY = 'test-encrypt-key-0123456789';

let agent: MockAgent;
let dir = '';

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
});
afterEach(async () => {
  await agent.close();
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = '';
  }
});

/** DbBackupService fittizio: espone solo il backup più recente (l'unico metodo usato). */
function fakeBackup(path: string | null): DbBackupService {
  return {
    latestBackupPath: async () => (path ? { name: 'animeunion-latest.db', path } : null),
  } as unknown as DbBackupService;
}

function setup(backupPath: string | null = null) {
  const db: Db = createTestDb();
  const config = createConfigService({ db, encryptKey: ENCRYPT_KEY });
  const service = createCloudBackupService({
    config,
    backup: fakeBackup(backupPath),
    logger: testLogger,
  });
  return { db, config, service };
}

function makeBackupFile(): string {
  dir = mkdtempSync(join(tmpdir(), 'au-gd-'));
  const path = join(dir, 'animeunion-latest.db');
  writeFileSync(path, 'FAKE-SQLITE-CONTENT');
  return path;
}

describe('CloudBackupService', () => {
  it('buildAuthUrl richiede le credenziali del client', () => {
    const { service } = setup();
    expect(() => service.buildAuthUrl()).toThrow(/client oauth/i);
  });

  it('buildAuthUrl costruisce un URL di consenso con scope drive.file e offline', () => {
    const { config, service } = setup();
    config.set('gdriveClientId', 'CID.apps.googleusercontent.com');
    config.set('gdriveClientSecret', 'SECRET');
    const url = service.buildAuthUrl();
    expect(url).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file');
    expect(url).toContain('access_type=offline');
    expect(url).toContain('prompt=consent');
    expect(url).toContain('redirect_uri=http%3A%2F%2F127.0.0.1');
  });

  it('exchangeCode salva il refresh token cifrato a riposo', async () => {
    const { db, config, service } = setup();
    config.set('gdriveClientId', 'CID');
    config.set('gdriveClientSecret', 'SECRET');
    agent
      .get(OAUTH)
      .intercept({ path: '/token', method: 'POST' })
      .reply(200, { refresh_token: 'RT-123', access_token: 'AT-1', expires_in: 3600 });

    await service.exchangeCode('AUTHCODE');

    // Il servizio config decifra: il chiamante vede il valore in chiaro.
    expect(config.get('gdriveRefreshToken')).toBe('RT-123');
    // Ma su disco (DB) è cifrato (prefisso aes256gcm:).
    const row = db
      .select()
      .from(schema.config)
      .where(eq(schema.config.key, 'gdriveRefreshToken'))
      .get();
    expect(JSON.parse(row?.value ?? '""')).toMatch(/^aes256gcm:/);
    expect(service.getStatus().connected).toBe(true);
  });

  it('exchangeCode senza refresh token nella risposta lancia un errore parlante', async () => {
    const { config, service } = setup();
    config.set('gdriveClientId', 'CID');
    config.set('gdriveClientSecret', 'SECRET');
    agent
      .get(OAUTH)
      .intercept({ path: '/token', method: 'POST' })
      .reply(200, { access_token: 'AT-1', expires_in: 3600 });

    await expect(service.exchangeCode('AUTHCODE')).rejects.toThrow(/refresh token/i);
    expect(service.getStatus().connected).toBe(false);
  });

  it('getStatus riflette collegato/scollegato e le credenziali del client', () => {
    const { config, service } = setup();
    expect(service.getStatus()).toMatchObject({ connected: false, clientConfigured: false });
    config.set('gdriveClientId', 'CID');
    config.set('gdriveClientSecret', 'SECRET');
    config.set('gdriveRefreshToken', 'RT');
    config.set('gdriveFolderId', 'FOLDER');
    expect(service.getStatus()).toMatchObject({
      connected: true,
      clientConfigured: true,
      folderConfigured: true,
    });
    service.disconnect();
    const after = service.getStatus();
    expect(after.connected).toBe(false);
    expect(after.folderConfigured).toBe(false);
  });

  it('uploadLatestBackup: refresh → crea cartella → upload multipart → prune', async () => {
    const { config, service } = setup(makeBackupFile());
    config.set('gdriveClientId', 'CID');
    config.set('gdriveClientSecret', 'SECRET');
    config.set('gdriveRefreshToken', 'RT');
    config.set('gdriveEnabled', true);
    config.set('gdriveRetention', 2);

    const oauth = agent.get(OAUTH);
    oauth
      .intercept({ path: '/token', method: 'POST' })
      .reply(200, { access_token: 'AT-1', expires_in: 3600 });

    const gapi = agent.get(GAPI);
    // Creazione cartella (gdriveFolderId vuoto).
    gapi
      .intercept({ path: (p) => p.startsWith('/drive/v3/files?fields=id'), method: 'POST' })
      .reply(200, { id: 'FOLDER-1' });
    // Upload multipart.
    gapi
      .intercept({ path: (p) => p.startsWith('/upload/drive/v3/files'), method: 'POST' })
      .reply(200, { id: 'FILE-1', name: 'animeunion-latest.db' });
    // Lista per il prune: 3 file, retention 2 → elimina il più vecchio (FILE-3).
    // (undici riordina i query param: match sul solo prefisso del path, method GET.)
    gapi
      .intercept({ path: (p) => p.startsWith('/drive/v3/files?'), method: 'GET' })
      .reply(200, { files: [{ id: 'FILE-1' }, { id: 'FILE-2' }, { id: 'FILE-3' }] });
    gapi.intercept({ path: '/drive/v3/files/FILE-3', method: 'DELETE' }).reply(204, {});

    const res = await service.uploadLatestBackup();
    expect(res.ok).toBe(true);
    expect(res.name).toBe('animeunion-latest.db');
    // La cartella creata viene memorizzata per i prossimi upload.
    expect(config.get('gdriveFolderId')).toBe('FOLDER-1');
    const st = service.getStatus();
    expect(st.lastUploadName).toBe('animeunion-latest.db');
    expect(st.lastError).toBeNull();
    // Tutti gli interceptor (incluso il DELETE del prune) sono stati consumati.
    agent.assertNoPendingInterceptors();
  });

  it('uploadLatestBackup non fa rete se il backup su Drive è disattivato', async () => {
    const { service } = setup(makeBackupFile());
    // gdriveEnabled è false: deve fallire prima di qualunque chiamata (netConnect disabilitato).
    await expect(service.uploadLatestBackup()).rejects.toThrow(/non abilitato/i);
  });

  it('un errore di Google finisce in lastError senza restare silenzioso', async () => {
    const { config, service } = setup(makeBackupFile());
    config.set('gdriveClientId', 'CID');
    config.set('gdriveClientSecret', 'SECRET');
    config.set('gdriveRefreshToken', 'RT');
    config.set('gdriveEnabled', true);
    agent
      .get(OAUTH)
      .intercept({ path: '/token', method: 'POST' })
      .reply(400, { error: 'invalid_grant' });

    await expect(service.uploadLatestBackup()).rejects.toThrow(/400|refresh/i);
    expect(service.getStatus().lastError).toMatch(/400|refresh/i);
  });
});
