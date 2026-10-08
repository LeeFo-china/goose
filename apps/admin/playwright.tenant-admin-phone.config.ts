import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", testMatch: "tenant-admin-phone-change.spec.ts",
  timeout: 45_000, workers: 1, fullyParallel: false, retries: 0,
  reporter: [["list"]], outputDir: "test-results/tenant-admin-phone",
  use: { baseURL: "http://127.0.0.1:3036", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    { command: "node e2e/tenant-admin-phone-mock-backend.mjs", url: "http://127.0.0.1:3996/health",
      reuseExistingServer: false, timeout: 10_000 },
    { command: "node scripts/playwright-dev-server.mjs", url: "http://127.0.0.1:3036",
      env: { GOOES_API_BASE_URL: "http://127.0.0.1:3996", PLAYWRIGHT_DEV_SERVER_PORT: "3036",
        PLAYWRIGHT_NEXT_DIST_DIR: ".next-e2e/tenant-admin-phone" },
      reuseExistingServer: false, timeout: 120_000, gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 } },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
