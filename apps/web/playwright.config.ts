import { defineConfig, devices } from "@playwright/test";

const port = 3020;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : [
        {
          command: "node e2e/upstream-stub.mjs",
          url: "http://127.0.0.1:3900",
          reuseExistingServer: !process.env.CI,
        },
        {
          command: "GOOES_API_BASE_URL=http://127.0.0.1:3900 GOOES_WEB_PROXY_SHARED_SECRET=e2e-shared-secret GOOES_PREVIEW_SHARED_SECRET=e2e-preview-shared-secret-that-is-long GOOES_PREVIEW_SESSION_SECRET=e2e-preview-session-secret-that-is-long pnpm dev",
          url: baseURL,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ],
});
