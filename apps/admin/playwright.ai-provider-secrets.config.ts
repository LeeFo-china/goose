import { defineConfig, devices } from '@playwright/test';
if (process.env.FORCE_COLOR && process.env.NO_COLOR) delete process.env.NO_COLOR;
export default defineConfig({
  testDir: './e2e', testMatch: ['ai-provider-secrets.spec.ts', 'ai-provider-delete.spec.ts', 'ai-model-routes.spec.ts'], workers: 1, retries: 0,
  timeout: 45000, reporter: [['list']], outputDir: 'test-results/ai-provider-secrets',
  use: { baseURL: 'http://127.0.0.1:3039', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'node e2e/ai-provider-secrets-mock-backend.mjs', url: 'http://127.0.0.1:3989/health', reuseExistingServer: false },
    { command: 'node scripts/playwright-dev-server.mjs', url: 'http://127.0.0.1:3039',
      env: { GOOES_API_BASE_URL: 'http://127.0.0.1:3989', PLAYWRIGHT_DEV_SERVER_PORT: '3039', PLAYWRIGHT_NEXT_DIST_DIR: '.next-e2e/ai-provider-secrets' },
      timeout: 120000, reuseExistingServer: false, gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 } },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
