import { defineConfig, devices } from '@playwright/test';

if (process.env.FORCE_COLOR && process.env.NO_COLOR)
  delete process.env.NO_COLOR;
export default defineConfig({
  testDir: './e2e',
  testMatch: 'warehouse-materials-workflow.spec.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results/warehouse-materials',
  use: {
    baseURL: 'http://127.0.0.1:3041',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      name: 'materials-fixture',
      command: 'node e2e/warehouse-materials-mock-backend.mjs',
      url: 'http://127.0.0.1:3997/health',
      reuseExistingServer: false,
      timeout: 10_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 2_000 },
    },
    {
      name: 'materials-admin',
      command: 'node scripts/playwright-dev-server.mjs',
      url: 'http://127.0.0.1:3041',
      env: {
        GOOES_API_BASE_URL: 'http://127.0.0.1:3997',
        PLAYWRIGHT_DEV_SERVER_PORT: '3041',
        PLAYWRIGHT_NEXT_DIST_DIR: '.next-e2e/materials',
      },
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-375',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
      },
    },
  ],
});
