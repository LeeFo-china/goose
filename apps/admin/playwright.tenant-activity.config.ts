import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", testMatch: "tenant-activity.spec.ts", timeout: 60_000,
  workers: 1, fullyParallel: false, retries: 0, reporter: [["list"]],
  outputDir: "test-results/tenant-activity",
  use: { baseURL: "http://127.0.0.1:3037", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    { command: "node e2e/tenant-activity-mock-backend.mjs", url: "http://127.0.0.1:3997/health", reuseExistingServer: false },
    { command: "node scripts/playwright-dev-server.mjs", url: "http://127.0.0.1:3037",
      env: { GOOES_API_BASE_URL: "http://127.0.0.1:3997", PLAYWRIGHT_DEV_SERVER_PORT: "3037", PLAYWRIGHT_NEXT_DIST_DIR: ".next-e2e/tenant-activity" },
      reuseExistingServer: false, timeout: 120_000, gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 } },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
