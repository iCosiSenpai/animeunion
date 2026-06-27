import { expect, test } from '@playwright/test';

// Smoke test dei flussi critici: l'app si avvia (web + api in mock) e risponde. Volutamente
// resiliente (la home può mostrare il wizard di setup al primo avvio): verifica lo shell, non i dati.

test('la home risponde e mostra il brand AnimeUnion', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/AnimeUnion/i);
  await expect(page.locator('body')).toBeVisible();
});

test("l'API risponde su /health", async ({ request }) => {
  const res = await request.get('http://127.0.0.1:3001/health');
  expect(res.ok()).toBeTruthy();
});

test('il catalogo è raggiungibile', async ({ page }) => {
  await page.goto('/catalog');
  await expect(page).toHaveTitle(/AnimeUnion/i);
});
