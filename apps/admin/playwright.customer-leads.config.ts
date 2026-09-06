import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: 'customer-leads-workflow.spec.ts',
  timeout: 45_000, workers: 1, fullyParallel: false, retries: 0,
  reporter: [['list']],
  outputDir: 'test-results/customer-leads',
  use: { baseURL: 'http://127.0.0.1:3038', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'node e2e/customer-leads-mock-backend.mjs', url: 'http://127.0.0.1:3988/health', reuseExistingServer: false, timeout: 10_000 },
    { command: 'node scripts/playwright-dev-server.mjs', url: 'http://127.0.0.1:3038',
      env: { GOOES_API_BASE_URL: 'http://127.0.0.1:3988', PLAYWRIGHT_DEV_SERVER_PORT: '3038', PLAYWRIGHT_NEXT_DIST_DIR: '.next-e2e/customer-leads' },
      reuseExistingServer: false, timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 } },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
