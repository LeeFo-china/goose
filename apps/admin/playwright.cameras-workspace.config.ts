import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e', testMatch:'cameras-workspace.spec.ts', workers:1, timeout:60000,
  reporter:[['list']], outputDir:'test-results/cameras-workspace',
  use:{baseURL:'http://127.0.0.1:3047',screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:[
    {command:'node e2e/cameras-workspace-mock.mjs',url:'http://127.0.0.1:3997/health',reuseExistingServer:false},
    {command:'node scripts/playwright-dev-server.mjs',url:'http://127.0.0.1:3047',timeout:120000,
      env:{GOOES_API_BASE_URL:'http://127.0.0.1:3997',PLAYWRIGHT_DEV_SERVER_PORT:'3047',PLAYWRIGHT_NEXT_DIST_DIR:'.next-e2e/cameras-workspace'},reuseExistingServer:false},
  ],
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
});
