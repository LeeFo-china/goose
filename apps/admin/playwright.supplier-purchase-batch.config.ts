import { defineConfig, devices } from "@playwright/test";

if (process.env.FORCE_COLOR && process.env.NO_COLOR) {
  delete process.env.NO_COLOR;
}
export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "supplier-purchase-batch-workflow.spec.ts",
    "supplier-purchase-batch-recovery.spec.ts",
  ],
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3036",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  outputDir: "test-results/supplier-purchase-batch",
  webServer: [
    {
      name: "purchase-batch-fixture",
      command: "node e2e/supplier-purchase-batch-mock-backend.mjs",
      url: "http://127.0.0.1:3986/health",
      reuseExistingServer: false,
      timeout: 10_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 2_000 },
    },
    {
      name: "purchase-batch-admin",
      command: "node scripts/playwright-dev-server.mjs",
      url: "http://127.0.0.1:3036",
      env: {
        GOOES_API_BASE_URL: "http://127.0.0.1:3986",
        PLAYWRIGHT_DEV_SERVER_PORT: "3036",
        PLAYWRIGHT_NEXT_DIST_DIR: ".next-e2e/supplier-purchase-batch",
      },
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
