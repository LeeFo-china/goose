import { beforeEach, describe, expect, mock, test } from "bun:test";

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
  update(patch: Record<string, unknown>) {
    calls.push(["update", patch]);
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
    expect(selectCall?.[1]).not.toBe("*");
    expect(calls).toContainEqual([
      "eq",
      "code",
      "custom_support_branding_annual",
    ]);
  });

  test("updates mutable fields with an optimistic version condition", async () => {
    const updated = {
      id: "product-1",
      code: "custom_support_branding_annual",
      version: 4,
    };
    result = { data: updated, error: null };
    const { BrandingAddonProductRepository } = await import(
      "./branding-addon-products"
    );
    const repository = new BrandingAddonProductRepository(() => client);

    const actual = await repository.updateProduct({
      name: "年度品牌技术支持",
      amountFen: 1,
      purchaseNotes: "支付成功后自动开通一年",
      enabled: true,
      expectedVersion: 3,
      updatedByEmployeeId: "employee-1",
    });

    expect(calls).toContainEqual([
      "update",
      {
        name: "年度品牌技术支持",
        amount_fen: 1,
        purchase_notes: "支付成功后自动开通一年",
        enabled: true,
        version: 4,
        updated_by_employee_id: "employee-1",
      },
    ]);
    expect(calls).toContainEqual(["eq", "version", 3]);
    expect(actual?.id).toBe("product-1");
    expect(actual?.version).toBe(4);
  });
});
