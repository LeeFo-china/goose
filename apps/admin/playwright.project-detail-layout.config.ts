import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: 'project-detail-layout.spec.ts', workers: 1, timeout: 60000,
  reporter: [['list']], outputDir: 'test-results/project-detail-layout',
  use: { baseURL: 'http://127.0.0.1:3046', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node e2e/project-detail-layout-mock.mjs', url: 'http://127.0.0.1:3996/health', reuseExistingServer: false },
    { command: 'node scripts/playwright-dev-server.mjs', url: 'http://127.0.0.1:3046', timeout: 120000,
      env: { GOOES_API_BASE_URL: 'http://127.0.0.1:3996', PLAYWRIGHT_DEV_SERVER_PORT: '3046', PLAYWRIGHT_NEXT_DIST_DIR: '.next-e2e/project-detail-layout' }, reuseExistingServer: false },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
