import { defineConfig, devices } from '@playwright/test';

// E2E end-to-end: avvia app e API in modalità mock, senza credenziali, database o server di
// sviluppo locali. Gli spec sono `*.e2e.ts` così Vitest non li raccoglie.
const WEB_PORT = 3000;
const API_PORT = 3001;
const AUTH_PORT = 3100;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
const API_URL = `http://127.0.0.1:${API_PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  outputDir: 'test-results',
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: WEB_URL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/mock-animeunion-server.mjs',
      url: `http://127.0.0.1:${AUTH_PORT}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { E2E_AUTH_PORT: String(AUTH_PORT) },
    },
    {
      command: 'npm run start:e2e -w @animeunion/api',
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ANIMEUNION_API_URL: `http://127.0.0.1:${AUTH_PORT}/api/v1/integration`,
        ANIMEUNION_EMAIL: 'e2e@animeunion.test',
        ANIMEUNION_PASSWORD: 'playwright-only',
        API_PORT: String(API_PORT),
        DATABASE_PATH: ':memory:',
        NODE_ENV: 'test',
        RATE_LIMIT_MS: '1',
        SOURCE_MODE: 'mock',
        WEB_LOCK_DISABLED: 'true',
      },
    },
    {
      command: 'npm run build -w @animeunion/web && node e2e/start-web-server.mjs',
      url: `${WEB_URL}/logo.png`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        API_URL,
        E2E_WEB_PORT: String(WEB_PORT),
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
});
