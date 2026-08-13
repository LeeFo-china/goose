import { defineConfig, devices } from "@playwright/test";

if (process.env.FORCE_COLOR && process.env.NO_COLOR) delete process.env.NO_COLOR;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "supplier-foundation-smoke.spec.ts",
  grep: /租户私有供应商确定性交互/,
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3031",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  outputDir: "test-results/supplier-foundation",
  webServer: [
    {
      name: "supplier-foundation-mock",
      command: "node e2e/supplier-foundation-mock-backend.mjs",
      url: "http://127.0.0.1:3994/health",
      reuseExistingServer: false,
      timeout: 10_000,
    },
    {
      name: "supplier-foundation-admin",
      command: "node scripts/playwright-dev-server.mjs",
      url: "http://127.0.0.1:3031",
      env: {
        GOOES_API_BASE_URL: "http://127.0.0.1:3994",
        GOOES_E2E_TEST_HARNESS: "1",
        PLAYWRIGHT_DEV_SERVER_PORT: "3031",
        PLAYWRIGHT_NEXT_DIST_DIR: ".next-e2e/supplier-foundation",
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
