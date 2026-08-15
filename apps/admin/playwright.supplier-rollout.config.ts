import { defineConfig, devices } from "@playwright/test";

if (process.env.FORCE_COLOR && process.env.NO_COLOR) {
  delete process.env.NO_COLOR;
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "supplier-rollout-workflow.spec.ts",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3030",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  outputDir: "test-results/supplier-rollout",
  webServer: [
    {
      name: "supplier-rollout-mock",
      command: "node e2e/supplier-rollout-mock-backend.mjs",
      url: "http://127.0.0.1:3993/health",
      reuseExistingServer: false,
      timeout: 10_000,
      gracefulShutdown: {
        signal: "SIGTERM",
        timeout: 2_000,
      },
    },
    {
      name: "supplier-rollout-admin",
      command: "node scripts/playwright-dev-server.mjs",
      url: "http://127.0.0.1:3030",
      env: {
        GOOES_API_BASE_URL: "http://127.0.0.1:3993",
        GOOES_E2E_TEST_HARNESS: "1",
        PLAYWRIGHT_DEV_SERVER_PORT: "3030",
        PLAYWRIGHT_NEXT_DIST_DIR: ".next-e2e/supplier-rollout",
      },
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: {
        signal: "SIGTERM",
        timeout: 5_000,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
