import { defineConfig, devices } from '@playwright/test';

if (process.env.FORCE_COLOR && process.env.NO_COLOR)
  delete process.env.NO_COLOR;

export default defineConfig({
  testDir: './e2e',
  testMatch: 'inventory-workspace.spec.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results/inventory',
  use: {
    baseURL: 'http://127.0.0.1:3037',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      name: 'inventory-fixture',
      command: 'node e2e/inventory-mock-backend.mjs',
      url: 'http://127.0.0.1:4007/health',
      reuseExistingServer: false,
      timeout: 10_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 2_000 },
    },
    {
      name: 'inventory-admin',
      command: 'node scripts/playwright-dev-server.mjs',
      url: 'http://127.0.0.1:3037',
      env: {
        GOOES_API_BASE_URL: 'http://127.0.0.1:4007',
        PLAYWRIGHT_DEV_SERVER_PORT: '3037',
        PLAYWRIGHT_NEXT_DIST_DIR: '.next-e2e/inventory',
      },
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
