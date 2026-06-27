import { defineConfig, devices } from '@playwright/test';

// E2E end-to-end: avvia l'app intera in modalità mock (niente AnimeUnion reale) e la pilota con un
// browser. Gli spec sono `*.e2e.ts` (NON `*.test.ts`/`*.spec.ts`) così Vitest non li raccoglie.
// In CI gira come job NON bloccante (vedi .github/workflows/ci.yml): serve i browser via
// `npx playwright install`. In locale: `npm run test:e2e`.
const WEB_PORT = 3000;
const API_PORT = 3001;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Avvia API (mock) e Web (dev) prima dei test; in locale riusa i server già accesi.
  webServer: [
    {
      command: 'npm run dev:api',
      port: API_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        SOURCE_MODE: 'mock',
        DATABASE_PATH: ':memory:',
        WEB_LOCK_DISABLED: 'true',
      },
    },
    {
      command: 'npm run dev:web',
      port: WEB_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { API_URL: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
