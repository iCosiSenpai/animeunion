import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type TelegramCredentials, createTelegramNotifier } from './telegram';

const TELEGRAM = 'https://api.telegram.org';

let agent: MockAgent;

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
});
afterEach(async () => {
  await agent.close();
});

function notifier(creds: TelegramCredentials) {
  return createTelegramNotifier({ getCredentials: () => creds });
}

describe('TelegramNotifier', () => {
  it('isConfigured riflette le credenziali correnti', () => {
    expect(notifier({ botToken: 'T', chatId: '1' }).isConfigured()).toBe(true);
    expect(notifier({ botToken: 'T' }).isConfigured()).toBe(false);
    expect(notifier({}).isConfigured()).toBe(false);
  });

  it('sendTest ritorna ok su 200', async () => {
    agent
      .get(TELEGRAM)
      .intercept({ path: '/botTESTTOKEN/sendMessage', method: 'POST' })
      .reply(200, { ok: true }, { headers: { 'content-type': 'application/json' } });

    const res = await notifier({ botToken: 'TESTTOKEN', chatId: '42' }).sendTest();
    expect(res.ok).toBe(true);
  });

  it('sendTest ritorna errore su 4xx', async () => {
    agent
      .get(TELEGRAM)
      .intercept({ path: '/botBAD/sendMessage', method: 'POST' })
      .reply(401, { ok: false, description: 'Unauthorized' });

    const res = await notifier({ botToken: 'BAD', chatId: '42' }).sendTest();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/401/);
  });

  it('sendTest senza credenziali non fa rete e ritorna errore', async () => {
    const res = await notifier({}).sendTest();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/mancanti/i);
  });

  it('sendTest usa le credenziali override (test dei valori digitati)', async () => {
    agent
      .get(TELEGRAM)
      .intercept({ path: '/botOVERRIDE/sendMessage', method: 'POST' })
      .reply(200, { ok: true }, { headers: { 'content-type': 'application/json' } });

    // getCredentials vuoto: deve vincere l'override.
    const res = await notifier({}).sendTest({ botToken: 'OVERRIDE', chatId: '7' });
    expect(res.ok).toBe(true);
  });
});
