import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDiscordNotifier } from './discord';

const DISCORD = 'https://discord.com';
const WEBHOOK_PATH = '/api/webhooks/123/TESTTOKEN';
const WEBHOOK_URL = `${DISCORD}${WEBHOOK_PATH}`;

let agent: MockAgent;

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
});
afterEach(async () => {
  await agent.close();
});

function notifier(url: string | undefined) {
  return createDiscordNotifier({ getWebhookUrl: () => url });
}

describe('DiscordNotifier', () => {
  it('isConfigured riflette il webhook corrente', () => {
    expect(notifier(WEBHOOK_URL).isConfigured()).toBe(true);
    expect(notifier('').isConfigured()).toBe(false);
    expect(notifier(undefined).isConfigured()).toBe(false);
  });

  it('sendTest ritorna ok su 204', async () => {
    agent.get(DISCORD).intercept({ path: WEBHOOK_PATH, method: 'POST' }).reply(204, '');

    const res = await notifier(WEBHOOK_URL).sendTest();
    expect(res.ok).toBe(true);
  });

  it('sendTest ritorna errore su 4xx', async () => {
    agent
      .get(DISCORD)
      .intercept({ path: WEBHOOK_PATH, method: 'POST' })
      .reply(401, { message: 'Unauthorized' });

    const res = await notifier(WEBHOOK_URL).sendTest();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/401/);
  });

  it('sendTest senza webhook non fa rete e ritorna errore', async () => {
    const res = await notifier('').sendTest();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/mancante/i);
  });

  it('sendTest usa il webhook override (test del valore digitato)', async () => {
    const overridePath = '/api/webhooks/999/OVERRIDE';
    agent.get(DISCORD).intercept({ path: overridePath, method: 'POST' }).reply(204, '');

    // getWebhookUrl vuoto: deve vincere l'override.
    const res = await notifier('').sendTest(`${DISCORD}${overridePath}`);
    expect(res.ok).toBe(true);
  });
});
