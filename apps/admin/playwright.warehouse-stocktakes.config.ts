import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: ['warehouse-stocktakes-workflow.spec.ts', 'warehouse-stocktakes-recovery.spec.ts'],
  timeout: 60_000, fullyParallel: false, workers: 1, forbidOnly: Boolean(process.env.CI), retries: 0,
  reporter: [['list']], outputDir: 'test-results/warehouse-stocktakes',
  use: { baseURL: 'http://127.0.0.1:3043', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { name: 'stocktakes-fixture', command: 'node e2e/warehouse-stocktakes-mock-backend.mjs', url: 'http://127.0.0.1:4001/health',
      reuseExistingServer: false, timeout: 10_000, gracefulShutdown: { signal: 'SIGTERM', timeout: 2_000 } },
    { name: 'stocktakes-admin', command: 'node scripts/playwright-dev-server.mjs', url: 'http://127.0.0.1:3043',
      env: { GOOES_API_BASE_URL: 'http://127.0.0.1:4001', PLAYWRIGHT_DEV_SERVER_PORT: '3043', PLAYWRIGHT_NEXT_DIST_DIR: '.next-e2e/stocktakes' },
      reuseExistingServer: false, timeout: 120_000, gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 } },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-375', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
  ],
});
