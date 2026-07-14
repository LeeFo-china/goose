import { describe, expect, test } from "bun:test";

import {
  normalizeSmokeConfig,
  percentile,
  summarizeSamples,
} from "./project-operational-risk-performance-smoke";

describe("project operational risk performance smoke helpers", () => {
  test("calculates percentile with sorted ceil index", () => {
    const values = [90, 10, 80, 20, 70, 30, 60, 40, 50, 100];

    expect(percentile(values, 0.5)).toBe(50);
    expect(percentile(values, 0.95)).toBe(100);
    expect(percentile([], 0.95)).toBe(0);
  });

  test("summarizes samples with p50 and p95", () => {
    const summary = summarizeSamples([
      { phase: "rpc", round: 1, ms: 30, ok: true, total: 12, itemCount: 10 },
      { phase: "rpc", round: 2, ms: 10, ok: true, total: 12, itemCount: 10 },
      { phase: "rpc", round: 3, ms: 20, ok: true, total: 12, itemCount: 10 },
    ]);

    expect(summary).toEqual({
      count: 3,
      ok: 3,
      minMs: 10,
      avgMs: 20,
      p50Ms: 20,
      p95Ms: 30,
      maxMs: 30,
    });
  });

  test("normalizes read-only config and defaults iterations to 20", () => {
    const config = normalizeSmokeConfig({
      PROJECT_HEALTH_TENANT_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      PROJECT_HEALTH_API_URL: "https://api-dev.goodcms.cn",
      PROJECT_HEALTH_ADMIN_TOKEN: "admin-token",
    });

    expect(config).toEqual({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      iterations: 20,
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseServiceRoleKey: "service-role",
      apiUrl: "https://api-dev.goodcms.cn",
      adminToken: "admin-token",
    });
  });

  test("reports missing required config without running writes", () => {
    expect(() => normalizeSmokeConfig({})).toThrow(
      "PROJECT_HEALTH_TENANT_ID is required",
    );
    expect(() =>
      normalizeSmokeConfig({
        PROJECT_HEALTH_TENANT_ID: "tenant-1",
        SUPABASE_URL: "http://127.0.0.1:54321",
      }),
    ).toThrow("SUPABASE_SERVICE_ROLE_KEY is required");
  });
});
