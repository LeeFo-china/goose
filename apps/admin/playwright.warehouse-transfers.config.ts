import { defineConfig, devices } from '@playwright/test';

if (process.env.FORCE_COLOR && process.env.NO_COLOR) delete process.env.NO_COLOR;
export default defineConfig({
  testDir: './e2e', testMatch: 'warehouse-transfers-workflow.spec.ts',
  timeout: 60_000, fullyParallel: false, workers: 1, forbidOnly: Boolean(process.env.CI), retries: 0,
  reporter: [['list']], outputDir: 'test-results/warehouse-transfers',
  use: { baseURL: 'http://127.0.0.1:3042', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { name: 'transfers-fixture', command: 'node e2e/warehouse-transfers-mock-backend.mjs', url: 'http://127.0.0.1:3999/health',
      reuseExistingServer: false, timeout: 10_000, gracefulShutdown: { signal: 'SIGTERM', timeout: 2_000 } },
    { name: 'transfers-admin', command: 'node scripts/playwright-dev-server.mjs', url: 'http://127.0.0.1:3042',
      env: { GOOES_API_BASE_URL: 'http://127.0.0.1:3999', PLAYWRIGHT_DEV_SERVER_PORT: '3042', PLAYWRIGHT_NEXT_DIST_DIR: '.next-e2e/transfers' },
      reuseExistingServer: false, timeout: 120_000, gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 } },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-375', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
  ],
});
