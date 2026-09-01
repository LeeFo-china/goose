import { describe, expect, test } from "bun:test";

const ROOT_DIRECT_URL =
  "postgresql://fixture-user:fixture-password@api-dev.goodcms.cn:5432/postgres";

describe("supplier purchasable SKU dev direct command", () => {
  test("derives required TLS in memory and never writes the URL", async () => {
    const { runSupplierPurchasableSkuDevDirectCli } = await import(
      "./supplier-purchasable-sku-dev-direct"
    );
    const calls: unknown[] = [];

    const exitCode = await runSupplierPurchasableSkuDevDirectCli({
      mode: "smoke",
      env: { SUPABASE_DB_DIRECT_URL: ROOT_DIRECT_URL },
      run: async (mode, databaseUrl) => {
        calls.push({ mode, databaseUrl });
        return 0;
      },
      writeError: (message) => calls.push({ error: message }),
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([{
      mode: "smoke",
      databaseUrl: `${ROOT_DIRECT_URL}?sslmode=require`,
    }]);
  });

  test("fails closed with a stable error and no URL disclosure", async () => {
    const { runSupplierPurchasableSkuDevDirectCli } = await import(
      "./supplier-purchasable-sku-dev-direct"
    );
    const errors: string[] = [];

    const exitCode = await runSupplierPurchasableSkuDevDirectCli({
      mode: "explain",
      env: {
        SUPABASE_DB_DIRECT_URL:
          "postgresql://secret:secret@api.goodcms.cn:5432/postgres",
      },
      run: async () => 0,
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      "SUPPLIER_PURCHASABLE_SKU_DEV_DIRECT_FAILED",
    ]);
    expect(errors.join(" ")).not.toContain("secret");
    expect(errors.join(" ")).not.toContain("api.goodcms.cn");
  });

  test("checks in working package and Task 8/9 commands", async () => {
    const packageJson = await Bun.file(
      new URL("../../package.json", import.meta.url),
    ).json() as { scripts?: Record<string, string> };
    const plan = await Bun.file(new URL(
      "../../../../docs/superpowers/plans/2026-09-01-supplier-sku-inline-price.md",
      import.meta.url,
    )).text();

    expect(packageJson.scripts?.[
      "supplier:purchasable-sku:smoke:dev-direct"
    ]).toBe("bun src/scripts/supplier-purchasable-sku-dev-direct.ts smoke");
    expect(packageJson.scripts?.[
      "supplier:purchasable-sku:explain:dev-direct"
    ]).toBe("bun src/scripts/supplier-purchasable-sku-dev-direct.ts explain");
    expect(plan).toContain("supplier:purchasable-sku:smoke:dev-direct");
    expect(plan).toContain("supplier:purchasable-sku:explain:dev-direct");
    expect(plan).not.toContain(
      'SUPPLIER_PURCHASABLE_SKU_SMOKE_DB_URL="$SUPABASE_DB_DIRECT_URL"',
    );
    expect(plan).not.toContain(
      'SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL="$SUPABASE_DB_DIRECT_URL"',
    );
  });
});
