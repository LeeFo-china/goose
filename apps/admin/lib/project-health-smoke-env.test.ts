import { describe, expect, test } from "bun:test";

import {
  DEFAULT_PROJECT_HEALTH_SMOKE_TENANT_ADMIN_PHONE,
  resolveProjectHealthSmokeTenantAdminPhone,
} from "./project-health-smoke-env";

describe("resolveProjectHealthSmokeTenantAdminPhone", () => {
  test("uses the explicit tenant admin phone when provided", () => {
    expect(
      resolveProjectHealthSmokeTenantAdminPhone({
        PLAYWRIGHT_BASE_URL: "https://admin-dev.goodcms.cn",
        GOOES_API_BASE_URL: "https://api-dev.goodcms.cn",
        GOOES_E2E_TENANT_ADMIN_PHONE: " 18812345678 ",
      }),
    ).toBe("18812345678");
  });

  test("allows the default phone for local mock smoke", () => {
    expect(
      resolveProjectHealthSmokeTenantAdminPhone({
        PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3011",
        GOOES_API_BASE_URL: "http://127.0.0.1:3999",
      }),
    ).toBe(DEFAULT_PROJECT_HEALTH_SMOKE_TENANT_ADMIN_PHONE);
  });

  test("requires an explicit phone when the Admin target is remote", () => {
    expect(() =>
      resolveProjectHealthSmokeTenantAdminPhone({
        PLAYWRIGHT_BASE_URL: "https://admin-dev.goodcms.cn",
        GOOES_API_BASE_URL: "http://127.0.0.1:3999",
      }),
    ).toThrow("GOOES_E2E_TENANT_ADMIN_PHONE is required");
  });

  test("requires an explicit phone when the API target is remote", () => {
    expect(() =>
      resolveProjectHealthSmokeTenantAdminPhone({
        PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3011",
        GOOES_API_BASE_URL: "https://api-dev.goodcms.cn",
      }),
    ).toThrow("GOOES_E2E_TENANT_ADMIN_PHONE is required");
  });
});
