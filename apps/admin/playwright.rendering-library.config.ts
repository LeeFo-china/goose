import { defineConfig, devices } from '@playwright/test';

if (process.env.FORCE_COLOR && process.env.NO_COLOR) delete process.env.NO_COLOR;

export default defineConfig({
  testDir: './e2e', testMatch: ['rendering-library-workflow.spec.ts', 'rendering-library-publication-recovery.spec.ts'],
  timeout: 45000, workers: 1, fullyParallel: false, retries: 0,
  forbidOnly: Boolean(process.env.CI), reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3038', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  outputDir: 'test-results/rendering-library',
  webServer: [
    { command: 'node e2e/rendering-library-mock-backend.mjs', url: 'http://127.0.0.1:3988/health',
      reuseExistingServer: false, timeout: 10000, gracefulShutdown: { signal: 'SIGTERM', timeout: 2000 } },
    { command: 'node scripts/playwright-dev-server.mjs', url: 'http://127.0.0.1:3038',
      env: { GOOES_API_BASE_URL: 'http://127.0.0.1:3988', PLAYWRIGHT_DEV_SERVER_PORT: '3038',
        PLAYWRIGHT_NEXT_DIST_DIR: '.next-e2e/rendering-library' },
      reuseExistingServer: false, timeout: 120000, gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 } },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
