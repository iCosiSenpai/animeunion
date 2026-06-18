import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHttpClient } from './http-client';

const BASE = 'https://api.test';
const JSON_HEADERS = { headers: { 'content-type': 'application/json' } };

let agent: MockAgent;

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
});
afterEach(async () => {
  await agent.close();
});

describe('createHttpClient — gestione 429', () => {
  it('riprova dopo un 429 (retry-after) e poi riesce', async () => {
    const pool = agent.get(BASE);
    pool
      .intercept({ path: '/stats', method: 'GET' })
      .reply(429, '', { headers: { 'retry-after': '0' } });
    pool.intercept({ path: '/stats', method: 'GET' }).reply(200, { ok: true }, JSON_HEADERS);

    const client = createHttpClient({ baseUrl: BASE, rateLimitMs: 1 });
    await expect(client.get('/stats')).resolves.toEqual({ ok: true });
  });

  it('dopo troppi 429 propaga ApiError 429', async () => {
    const pool = agent.get(BASE);
    for (let i = 0; i < 4; i++) {
      pool
        .intercept({ path: '/stats', method: 'GET' })
        .reply(429, '', { headers: { 'retry-after': '0' } });
    }

    const client = createHttpClient({ baseUrl: BASE, rateLimitMs: 1 });
    await expect(client.get('/stats')).rejects.toThrow(/429/);
  });
});
