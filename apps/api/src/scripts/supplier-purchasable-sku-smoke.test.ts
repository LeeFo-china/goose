import { describe, expect, test } from "bun:test";

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

    expect(config.databaseUrl).toBe(DATABASE_URL);
    expect(config.databaseHost).toBe("api-dev.goodcms.cn");
    expect(config.redactedDatabaseUrl).toBe(
      "postgresql://***:***@api-dev.goodcms.cn:5432/postgres?sslmode=require",
    );
    expect(redactSupplierPurchasableSkuDatabaseUrl(DATABASE_URL))
      .not.toContain("fixture-user");
    expect(redactSupplierPurchasableSkuDatabaseUrl(DATABASE_URL))
      .not.toContain("fixture-password");
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
