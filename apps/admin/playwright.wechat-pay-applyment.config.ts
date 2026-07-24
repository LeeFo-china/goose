import { defineConfig, devices } from "@playwright/test";

if (process.env.FORCE_COLOR && process.env.NO_COLOR) {
  delete process.env.NO_COLOR;
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "wechat-pay-applyment-materials.spec.ts",
    "wechat-pay-applyment-readiness.spec.ts",
    "wechat-pay-applyment-review.spec.ts",
  ],
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3021",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  outputDir: "test-results/wechat-pay-applyment",
  webServer: [
    {
      name: "wechat-pay-applyment-mock",
      command: "node e2e/wechat-pay-applyment-mock-backend.mjs",
      url: "http://127.0.0.1:3998/health",
      reuseExistingServer: false,
      timeout: 10_000,
      gracefulShutdown: {
        signal: "SIGTERM",
        timeout: 2_000,
      },
    },
    {
      name: "wechat-pay-applyment-admin",
      command: "node scripts/playwright-dev-server.mjs",
      url: "http://127.0.0.1:3021",
      env: {
        GOOES_API_BASE_URL: "http://127.0.0.1:3998",
        PLAYWRIGHT_DEV_SERVER_PORT: "3021",
        PLAYWRIGHT_NEXT_DIST_DIR: ".next-e2e/wechat-pay-applyment",
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
