import { beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const calls: Array<[string, ...unknown[]]> = [];
let result: { data: unknown; error: unknown } = { data: null, error: null };

const query = {
  select(columns: string) {
    calls.push(["select", columns]);
    return query;
  },
  eq(column: string, value: unknown) {
    calls.push(["eq", column, value]);
    return query;
  },
  maybeSingle: mock(async () => result),
};

const client = {
  from(table: string) {
    calls.push(["from", table]);
    return query;
  },
};

describe("BrandingAddonProductRepository", () => {
  beforeEach(() => {
    calls.length = 0;
    result = { data: null, error: null };
    query.maybeSingle.mockClear();
  });

  test("reads the fixed product with only contract fields", async () => {
    const { BrandingAddonProductRepository } = await import(
      "./branding-addon-products"
    );
    const repository = new BrandingAddonProductRepository(() => client);

    await repository.getProduct();

    expect(calls).toContainEqual(["from", "platform_addon_products"]);
    const selectCall = calls.find(([method]) => method === "select");
    expect(selectCall?.[1]).toContain("amount_fen");
    expect(selectCall?.[1]).toContain("purchase_mode");
    expect(selectCall?.[1]).not.toBe("*");
    expect(calls).toContainEqual([
      "eq",
      "code",
      "custom_support_branding_annual",
    ]);
  });

  test("does not expose a direct product table write command", () => {
    const source = readFileSync(new URL(
      "./branding-addon-products.ts",
      import.meta.url,
    ), "utf8");
    expect(source).not.toContain("updateProduct");
    expect(source).not.toMatch(/\.update\s*\(/);
    expect(source).not.toContain("update(patch: Record<string, unknown>)");
  });

  test("does not expose Supabase diagnostics", async () => {
    result = {
      data: null,
      error: { message: "secret sql", details: "private row" },
    };
    const { BrandingAddonProductRepository } = await import(
      "./branding-addon-products"
    );
    const repository = new BrandingAddonProductRepository(() => client);

    await expect(repository.getProduct()).rejects.toMatchObject({
      code: "DB_ERROR",
      details: undefined,
    });
  });
});
