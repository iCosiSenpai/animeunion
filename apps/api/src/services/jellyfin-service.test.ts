import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, testLogger } from '../test/helpers';
import { createConfigService } from './config-service';
import { createJellyfinService } from './jellyfin-service';

interface Recorded {
  method: string;
  url: string;
  token: string | undefined;
}

function startServer(handler: (rec: Recorded) => { status: number; body?: unknown }): Promise<{
  server: Server;
  base: string;
  hits: Recorded[];
}> {
  const hits: Recorded[] = [];
  const server = createServer((req, res) => {
    const rec: Recorded = {
      method: req.method ?? '',
      url: req.url ?? '',
      token: (req.headers['x-emby-token'] as string | undefined) ?? undefined,
    };
    hits.push(rec);
    const { status, body } = handler(rec);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(body ? JSON.stringify(body) : '');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}`, hits });
    });
  });
}

describe('JellyfinService', () => {
  let db: ReturnType<typeof createTestDb>;
  let server: Server | null = null;

  beforeEach(() => {
    db = createTestDb();
  });
  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = null;
    }
  });

  function makeService(now?: () => number) {
    const config = createConfigService({ db });
    return { service: createJellyfinService({ config, logger: testLogger, now }), config };
  }

  it('testConnection: 200 → ok con nome e versione, token nell header', async () => {
    const s = await startServer(() => ({
      status: 200,
      body: { ServerName: 'Casa', Version: '10.9.0' },
    }));
    server = s.server;
    const { service } = makeService();
    const res = await service.testConnection({ serverUrl: s.base, apiKey: 'k-123' });
    expect(res).toEqual({ ok: true, serverName: 'Casa', version: '10.9.0' });
    expect(s.hits[0]?.url).toBe('/System/Info');
    expect(s.hits[0]?.token).toBe('k-123');
  });

  it('testConnection: 401 → ok false con errore', async () => {
    const s = await startServer(() => ({ status: 401 }));
    server = s.server;
    const { service } = makeService();
    const res = await service.testConnection({ serverUrl: s.base, apiKey: 'sbagliata' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/401/);
  });

  it('testConnection: senza URL/chiave → ok false', async () => {
    const { service } = makeService();
    const res = await service.testConnection({ serverUrl: '', apiKey: '' });
    expect(res.ok).toBe(false);
  });

  it('refresh: chiama Library/Refresh e applica il debounce', async () => {
    const s = await startServer(() => ({ status: 204 }));
    server = s.server;
    let t = 0;
    const { service, config } = makeService(() => t);
    config.set('jellyfinServerUrl', `${s.base}/`); // con slash finale: deve essere normalizzato
    config.set('jellyfinApiKey', 'k-1');

    await service.refresh();
    expect(s.hits).toHaveLength(1);
    expect(s.hits[0]?.method).toBe('POST');
    expect(s.hits[0]?.url).toBe('/Library/Refresh');

    // Entro la finestra di debounce: niente seconda chiamata.
    t = 30_000;
    await service.refresh();
    expect(s.hits).toHaveLength(1);

    // Oltre la finestra: nuova chiamata.
    t = 61_000;
    await service.refresh();
    expect(s.hits).toHaveLength(2);
  });

  it('refresh: no-op se non configurato', async () => {
    const s = await startServer(() => ({ status: 204 }));
    server = s.server;
    const { service } = makeService();
    await service.refresh();
    expect(s.hits).toHaveLength(0);
  });
});
