import { describe, expect, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import { assertSupplierPurchasableSkuPermissionBoundary } from
  "./supplier-purchasable-sku-permission-boundary";
import {
  createSupplierPurchasableSkuSmokeSummary,
  redactSupplierPurchasableSkuDatabaseUrl,
  runSupplierPurchasableSkuSmoke,
  runSupplierPurchasableSkuSmokeCli,
  resolveSmokeConfig,
} from "./supplier-purchasable-sku-smoke";

const DATABASE_URL =
  "postgresql://fixture-user:fixture-password@api-dev.goodcms.cn:5432/postgres?sslmode=require";

describe("supplier purchasable SKU smoke command", () => {
  test("requires its explicit database URL", () => {
    expect(() => resolveSmokeConfig({})).toThrowError(
      "缺少 SUPPLIER_PURCHASABLE_SKU_SMOKE_DB_URL",
    );
  });

  test("redacts credentials while retaining the database host", () => {
    const config = resolveSmokeConfig({
      SUPPLIER_PURCHASABLE_SKU_SMOKE_DB_URL: DATABASE_URL,
    });

    expect(config.databaseHost).toBe("api-dev.goodcms.cn");
    expect(config.databaseConnection).toEqual({
      adapter: "postgres",
      hostname: "api-dev.goodcms.cn",
      port: 5432,
      database: "postgres",
      username: "fixture-user",
      password: "fixture-password",
      tls: true,
      url: DATABASE_URL,
    });
    expect(config).not.toHaveProperty("databaseUrl");
    expect(config.redactedDatabaseUrl).toBe(
      "postgresql://***:***@api-dev.goodcms.cn:5432/postgres?sslmode=require",
    );
    expect(redactSupplierPurchasableSkuDatabaseUrl(DATABASE_URL))
      .not.toContain("fixture-user");
    expect(redactSupplierPurchasableSkuDatabaseUrl(DATABASE_URL))
      .not.toContain("fixture-password");
  });

  test.each([
    "api.goodcms.cn",
    "api-dev.goodcms.cn.attacker.invalid",
    "unknown-db.internal",
  ])("rejects non-development database host %s", (host) => {
    expect(() => resolveSmokeConfig({
      SUPPLIER_PURCHASABLE_SKU_SMOKE_DB_URL:
        `postgresql://fixture:fixture@${host}:5432/postgres`,
    })).toThrowError(
      "SUPPLIER_PURCHASABLE_SKU_SMOKE_DB_URL 仅允许连接开发数据库主机",
    );
  });

  test("accepts an explicitly allowlisted local database host", () => {
    expect(resolveSmokeConfig({
      SUPPLIER_PURCHASABLE_SKU_SMOKE_DB_URL:
        "postgresql://fixture:fixture@127.0.0.1:5432/postgres",
    }).databaseHost).toBe("127.0.0.1");
  });

  test.each([
    [
      "postgresql://fixture:fixture@api-dev.goodcms.cn:5432/postgres?path=%2Ftmp%2Fpostgres",
      "SUPPLIER_PURCHASABLE_SKU_SMOKE_DB_URL 不允许数据库 URL 查询参数 path",
    ],
    [
      "postgresql://fixture:fixture@api-dev.goodcms.cn:5432/postgres",
      "SUPPLIER_PURCHASABLE_SKU_SMOKE_DB_URL 远程开发数据库必须显式使用安全 sslmode",
    ],
    [
      "postgresql://fixture:fixture@api-dev.goodcms.cn:5432/postgres?sslmode=disable",
      "SUPPLIER_PURCHASABLE_SKU_SMOKE_DB_URL 远程开发数据库必须显式使用安全 sslmode",
    ],
    [
      "postgresql://fixture:fixture@api-dev.goodcms.cn:5432/postgres?sslmode=prefer",
      "SUPPLIER_PURCHASABLE_SKU_SMOKE_DB_URL 远程开发数据库必须显式使用安全 sslmode",
    ],
    [
      "postgresql://fixture:fixture@api-dev.goodcms.cn:5432/postgres?sslmode=require&application_name=task8",
      "SUPPLIER_PURCHASABLE_SKU_SMOKE_DB_URL 不允许数据库 URL 查询参数 application_name",
    ],
  ])("rejects unsafe database routing or TLS input %#", (databaseUrl, error) => {
    expect(() => resolveSmokeConfig({
      SUPPLIER_PURCHASABLE_SKU_SMOKE_DB_URL: databaseUrl,
    })).toThrowError(error);
  });

  test("returns the complete structured verification summary", () => {
    expect(createSupplierPurchasableSkuSmokeSummary()).toEqual({
      created: true,
      edited: true,
      replayed: true,
      concurrent_conflict: true,
      future_preserved: true,
      resolver_verified: true,
      cleanup_verified: true,
    });
  });

  test("is import-safe and exposes the exact package command", async () => {
    const source = await Bun.file(
      new URL("./supplier-purchasable-sku-smoke.ts", import.meta.url),
    ).text();
    const packageJson = await Bun.file(
      new URL("../../package.json", import.meta.url),
    ).json() as { scripts?: Record<string, string> };

    expect(source).toContain("if (import.meta.main)");
    expect(packageJson.scripts?.["supplier:purchasable-sku:smoke"])
      .toBe("bun src/scripts/supplier-purchasable-sku-smoke.ts");
  });

  test("requires the exact access denial before any repository read", async () => {
    await expect(assertSupplierPurchasableSkuPermissionBoundary(
      async () => { throw Errors.forbidden(); },
      () => 0,
    )).resolves.toBeUndefined();
    await expect(assertSupplierPurchasableSkuPermissionBoundary(
      async () => { throw new Error("unrelated failure"); },
      () => 0,
    )).rejects.toThrow("SMOKE_PERMISSION_BOUNDARY_INVALID");
    await expect(assertSupplierPurchasableSkuPermissionBoundary(
      async () => { throw Errors.forbidden(); },
      () => 1,
    )).rejects.toThrow("SMOKE_PERMISSION_BOUNDARY_INVALID");
  });

  test("always verifies cleanup and records exact concurrency evidence", async () => {
    const calls: string[] = [];
    const result = await runSupplierPurchasableSkuSmoke({
      async runScenarios() {
        calls.push("scenarios");
        return {
          created: true,
          edited: true,
          replayed: true,
          concurrent_conflict: true,
          future_preserved: true,
          resolver_verified: true,
          concurrency: { successes: 1, conflicts: 1 },
        };
      },
      async cleanup() {
        calls.push("cleanup");
        return true;
      },
      async close() {
        calls.push("close");
      },
    });

    expect(calls).toEqual(["scenarios", "cleanup", "close"]);
    expect(result.summary).toEqual(createSupplierPurchasableSkuSmokeSummary());
    expect(result.concurrency).toEqual({ successes: 1, conflicts: 1 });
  });

  test("cleanup failure forces a nonzero sanitized CLI result", async () => {
    const output: string[] = [];
    const errors: string[] = [];
    const exitCode = await runSupplierPurchasableSkuSmokeCli({
      env: { SUPPLIER_PURCHASABLE_SKU_SMOKE_DB_URL: DATABASE_URL },
      createGateway: () => ({
        async runScenarios() {
          throw new Error("contains-sensitive-fixture-data");
        },
        async cleanup() {
          return false;
        },
        async close() {},
      }),
      writeOutput: (message) => output.push(message),
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(output).toEqual([]);
    expect(errors).toEqual(["SUPPLIER_PURCHASABLE_SKU_SMOKE_FAILED"]);
    expect(errors.join(" ")).not.toContain("contains-sensitive-fixture-data");
  });

  test("successful CLI output contains only sanitized host and evidence", async () => {
    const output: string[] = [];
    const exitCode = await runSupplierPurchasableSkuSmokeCli({
      env: { SUPPLIER_PURCHASABLE_SKU_SMOKE_DB_URL: DATABASE_URL },
      createGateway: () => ({
        async runScenarios() {
          return {
            created: true,
            edited: true,
            replayed: true,
            concurrent_conflict: true,
            future_preserved: true,
            resolver_verified: true,
            concurrency: { successes: 1, conflicts: 1 },
          };
        },
        async cleanup() {
          return true;
        },
        async close() {},
      }),
      writeOutput: (message) => output.push(message),
      writeError: () => {},
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(output[0]!)).toEqual({
      database_host: "api-dev.goodcms.cn",
      summary: createSupplierPurchasableSkuSmokeSummary(),
      concurrency: { successes: 1, conflicts: 1 },
    });
    expect(output[0]).not.toContain("fixture-user");
    expect(output[0]).not.toContain("fixture-password");
  });
});
