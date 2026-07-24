import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, root), "utf8");
}

describe("wechat pay applyment Playwright assembly", () => {
  test("keeps the mock-only spec out of the default E2E suite", () => {
    const source = read("playwright.config.ts");
    expect(source).toContain('"**/wechat-pay-applyment-materials.spec.ts"');
    expect(source).toContain('"**/wechat-pay-applyment-readiness.spec.ts"');
    expect(source).toContain('"**/wechat-pay-applyment-review.spec.ts"');
  });

  test("provides a dedicated config with isolated frontend and mock servers", () => {
    const configUrl = new URL(
      "playwright.wechat-pay-applyment.config.ts",
      root,
    );
    expect(existsSync(configUrl)).toBe(true);
    if (!existsSync(configUrl)) return;

    const source = read("playwright.wechat-pay-applyment.config.ts");
    expect(source).toContain('"wechat-pay-applyment-materials.spec.ts"');
    expect(source).toContain('"wechat-pay-applyment-readiness.spec.ts"');
    expect(source).toContain('"wechat-pay-applyment-review.spec.ts"');
    expect(source).toContain(
      'command: "node e2e/wechat-pay-applyment-mock-backend.mjs"',
    );
    expect(source).toContain('url: "http://127.0.0.1:3998/health"');
    expect(source).toContain(
      'command: "node scripts/playwright-dev-server.mjs"',
    );
    expect(source).toContain('baseURL: "http://127.0.0.1:3021"');
    expect(source).toContain('GOOES_API_BASE_URL: "http://127.0.0.1:3998"');
    expect(source).toContain('PLAYWRIGHT_DEV_SERVER_PORT: "3021"');
    expect(source).toContain(
      'PLAYWRIGHT_NEXT_DIST_DIR: ".next-e2e/wechat-pay-applyment"',
    );
    expect(source.match(/reuseExistingServer: false/g)).toHaveLength(2);
    expect(source.match(/gracefulShutdown:/g)).toHaveLength(2);
  });

  test("exposes the dedicated package script", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["test:e2e:wechat-pay-applyment"]).toBe(
      "env -u NO_COLOR playwright test --config=playwright.wechat-pay-applyment.config.ts",
    );
  });

  test("lets the shared Next launcher isolate its port and dist directory", () => {
    const source = read("scripts/playwright-dev-server.mjs");
    expect(source).toContain("PLAYWRIGHT_DEV_SERVER_PORT");
    expect(source).toContain("PLAYWRIGHT_NEXT_DIST_DIR");
  });

  test("removes the isolated Next output during launcher cleanup", () => {
    const source = read("scripts/playwright-dev-server.mjs");
    expect(source).toContain("function cleanup()");
    expect(source).toContain("rmSync(nextDistPath");
    expect(source).toContain('process.on("exit", cleanup)');
    expect(source).toContain("process.execPath");
    expect(source).toContain('"node_modules", "next", "dist", "bin", "next"');
    expect(source).not.toContain('"pnpm"');
  });

  test("gives the mock a readiness endpoint and graceful shutdown", () => {
    const source = read("e2e/wechat-pay-applyment-mock-backend.mjs");
    expect(source).toContain('url.pathname === "/health"');
    expect(source).toContain('process.on("SIGTERM"');
    expect(source).toContain("server.close");
  });

  test("lives under the Admin workspace test target", () => {
    expect(new URL(import.meta.url).pathname).toContain("/apps/admin/tests/");
  });
});
