import { defineConfig, devices } from "@playwright/test";

if (process.env.FORCE_COLOR && process.env.NO_COLOR) {
  delete process.env.NO_COLOR;
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "supplier-payment-workflow.spec.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3026",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  outputDir: "test-results/supplier-payment",
  webServer: [
    {
      name: "supplier-payment-mock",
      command: "node e2e/supplier-payment-mock-backend.mjs",
      url: "http://127.0.0.1:3995/health",
      reuseExistingServer: false,
      timeout: 10_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 2_000 },
    },
    {
      name: "supplier-payment-admin",
      command: "node scripts/playwright-dev-server.mjs",
      url: "http://127.0.0.1:3026",
      env: {
        GOOES_API_BASE_URL: "http://127.0.0.1:3995",
        PLAYWRIGHT_DEV_SERVER_PORT: "3026",
        PLAYWRIGHT_NEXT_DIST_DIR: ".next-e2e/supplier-payment",
      },
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
