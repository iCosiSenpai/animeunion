import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DownloadAbortedError, downloadToFile } from './http-downloader';

const BASE = 'https://cdn.test';

let agent: MockAgent;

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
});
afterEach(async () => {
  await agent.close();
});

describe('downloadToFile', () => {
  it('scarica un MP4 finto e lo scrive su disco', async () => {
    const work = await mkdtemp(join(tmpdir(), 'au-dl-'));
    try {
      const body = Buffer.from('fake-mp4-bytes-here');
      agent
        .get(BASE)
        .intercept({ path: '/file.mp4', method: 'GET' })
        .reply(200, body, { headers: { 'content-type': 'video/mp4' } });

      const dest = join(work, 'out.mp4');
      const result = await downloadToFile({ url: `${BASE}/file.mp4`, destPath: dest });

      expect(result.bytes).toBe(body.length);
      expect(result.contentType).toBe('video/mp4');
      const written = await readFile(dest);
      expect(written.equals(body)).toBe(true);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it('emette onProgress almeno a inizio e fine', async () => {
    const work = await mkdtemp(join(tmpdir(), 'au-dl-'));
    try {
      agent
        .get(BASE)
        .intercept({ path: '/x', method: 'GET' })
        .reply(200, Buffer.alloc(1024), {
          headers: { 'content-type': 'video/mp4', 'content-length': '1024' },
        });

      const events: { bytesDownloaded: number; totalBytes: number | null }[] = [];
      await downloadToFile({
        url: `${BASE}/x`,
        destPath: join(work, 'x.mp4'),
        onProgress: (p) => events.push(p),
      });

      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events.at(0)?.bytesDownloaded).toBe(0);
      expect(events.at(0)?.totalBytes).toBe(1024);
      expect(events.at(-1)?.bytesDownloaded).toBe(1024);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it('rigetta con errore esplicito su HTTP >= 400', async () => {
    const work = await mkdtemp(join(tmpdir(), 'au-dl-'));
    try {
      agent
        .get(BASE)
        .intercept({ path: '/missing', method: 'GET' })
        .reply(404, 'not found', { headers: { 'content-type': 'text/plain' } });

      await expect(
        downloadToFile({ url: `${BASE}/missing`, destPath: join(work, 'm.mp4') }),
      ).rejects.toThrow(/HTTP 404/);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it('rifiuta una pagina HTML (200 text/html) senza lasciare file', async () => {
    const work = await mkdtemp(join(tmpdir(), 'au-dl-'));
    try {
      agent
        .get(BASE)
        .intercept({ path: '/expired', method: 'GET' })
        .reply(200, '<!doctype html><html>link scaduto</html>', {
          headers: { 'content-type': 'text/html' },
        });

      const dest = join(work, 'expired.mp4');
      await expect(downloadToFile({ url: `${BASE}/expired`, destPath: dest })).rejects.toThrow(
        /non video/i,
      );
      expect(existsSync(dest)).toBe(false);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it('rifiuta un corpo HTML servito come video/mp4 (sniff primi byte)', async () => {
    const work = await mkdtemp(join(tmpdir(), 'au-dl-'));
    try {
      agent
        .get(BASE)
        .intercept({ path: '/fake', method: 'GET' })
        .reply(200, '<html>nope</html>', { headers: { 'content-type': 'video/mp4' } });

      const dest = join(work, 'fake.mp4');
      await expect(downloadToFile({ url: `${BASE}/fake`, destPath: dest })).rejects.toThrow(
        /non valido/i,
      );
      expect(existsSync(dest)).toBe(false);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it('AbortSignal interrompe il download e solleva DownloadAbortedError', async () => {
    const work = await mkdtemp(join(tmpdir(), 'au-dl-'));
    try {
      // Risposta grande a chunk per dare tempo all'abort.
      const big = Buffer.alloc(2 * 1024 * 1024, 'a');
      agent
        .get(BASE)
        .intercept({ path: '/big', method: 'GET' })
        .reply(200, big, { headers: { 'content-type': 'video/mp4' } });

      const ctrl = new AbortController();
      const promise = downloadToFile({
        url: `${BASE}/big`,
        destPath: join(work, 'big.mp4'),
        signal: ctrl.signal,
      });
      ctrl.abort();

      await expect(promise).rejects.toBeInstanceOf(DownloadAbortedError);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });
});
