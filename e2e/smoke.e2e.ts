import { resolve } from 'node:path';
import {
  type APIRequestContext,
  type APIResponse,
  type Page,
  expect,
  test,
} from '@playwright/test';

const API_URL = 'http://127.0.0.1:3001';

type TrpcEnvelope<T> = {
  error?: unknown;
  result?: { data?: T | { json: T } };
};

async function trpcData<T>(response: APIResponse, operation: string): Promise<T> {
  const body = await response.text();
  expect(response.ok(), `${operation} non riuscita: ${body}`).toBeTruthy();

  const envelope = JSON.parse(body) as TrpcEnvelope<T>;
  expect(envelope.error, `${operation} ha restituito un errore tRPC: ${body}`).toBeUndefined();
  if (!envelope.result || envelope.result.data === undefined) {
    throw new Error(`${operation} non ha restituito dati tRPC: ${body}`);
  }

  const data = envelope.result.data;
  return typeof data === 'object' && data !== null && 'json' in data ? data.json : data;
}

async function setConfig(request: APIRequestContext, key: string, value: unknown): Promise<void> {
  const response = await request.post(`${API_URL}/trpc/config.set`, {
    data: { key, value },
  });
  await trpcData(response, `config.set(${key})`);
}

async function blockExternalBrowserRequests(page: Page): Promise<void> {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 204, contentType: 'application/octet-stream', body: '' });
  });
}

test('un nuovo utente autenticato vede il setup, non un falso catalogo', async ({
  page,
  request,
}) => {
  await setConfig(request, 'setupCompleted', null);
  await setConfig(request, 'seriesPathSub', '');
  await blockExternalBrowserRequests(page);

  await page.goto('/catalog');

  await expect(
    page.getByRole('heading', { level: 1, name: 'La tua libreria, nel posto giusto.' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Iniziamo' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Catalogo' })).toHaveCount(0);
});

test("l'API espone un health payload esatto", async ({ request }) => {
  const response = await request.get(`${API_URL}/health`);

  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: 'ok' });
});

test('il catalogo configurato si sincronizza e renderizza i dati mock senza CDN esterni', async ({
  page,
  request,
}) => {
  await setConfig(request, 'seriesPathSub', resolve('.'));
  await setConfig(request, 'setupCompleted', true);
  await setConfig(request, 'animationsEnabled', false);
  await blockExternalBrowserRequests(page);

  await page.goto('/catalog?sort=title');
  await expect(page.getByRole('heading', { level: 1, name: 'Catalogo' })).toBeVisible();
  await expect(page.getByText('50 risultati', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: 'Edens Zero' })).toBeVisible();
});
