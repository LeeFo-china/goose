import { describe, expect, test } from "bun:test";

import {
  BrandingAddonCreateOrderSchema,
  BrandingAddonOrderListQuerySchema,
  BrandingAddonProductPatchSchema,
  PlatformBrandingAddonOrderListQuerySchema,
} from "./branding-addon";

describe("BrandingAddonProductPatchSchema", () => {
  test("accepts a positive integer price in fen", () => {
    expect(BrandingAddonProductPatchSchema.parse({
      name: "年度品牌技术支持",
      amount_fen: 1,
      purchase_notes: "支付成功后自动开通一年",
      enabled: true,
      version: 1,
    }).amount_fen).toBe(1);
  });

  test("accepts a patch containing any single mutable field", () => {
    for (const patch of [
      { name: "年度品牌技术支持" },
      { amount_fen: 1 },
      { purchase_notes: "支付成功后自动开通一年" },
      { enabled: true },
    ]) {
      expect(BrandingAddonProductPatchSchema.parse({
        ...patch,
        version: 1,
      })).toEqual({
        ...patch,
        version: 1,
      });
    }
  });

  test("rejects a patch containing only the version", () => {
    const result = BrandingAddonProductPatchSchema.safeParse({
      version: 1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          message: "至少提交一个可修改字段",
        }),
      );
    }
  });

  test("rejects a mutable field patch without the version", () => {
    expect(() => BrandingAddonProductPatchSchema.parse({
      name: "年度品牌技术支持",
    })).toThrow();
  });

  test("rejects immutable product contract fields", () => {
    const input = {
      name: "年度品牌技术支持",
      amount_fen: 1,
      purchase_notes: "支付成功后自动开通一年",
      enabled: true,
      version: 1,
    };

    for (const immutableField of [
      { code: "custom_support_branding_annual" },
      { entitlement_code: "custom_support_branding" },
      { term_years: 1 },
    ]) {
      expect(() => BrandingAddonProductPatchSchema.parse({
        ...input,
        ...immutableField,
      })).toThrow();
    }
  });

  test("rejects non-positive or fractional prices", () => {
    for (const amount_fen of [0, -1, 1.5]) {
      expect(() => BrandingAddonProductPatchSchema.parse({
        name: "年度品牌技术支持",
        amount_fen,
        purchase_notes: "支付成功后自动开通一年",
        enabled: true,
        version: 1,
      })).toThrow();
    }
  });

  test("enforces product name and purchase notes length boundaries", () => {
    expect(BrandingAddonProductPatchSchema.parse({
      name: "品".repeat(100),
      purchase_notes: "说".repeat(500),
      version: 1,
    })).toMatchObject({
      name: "品".repeat(100),
      purchase_notes: "说".repeat(500),
    });
    expect(() => BrandingAddonProductPatchSchema.parse({
      name: "品".repeat(101),
      version: 1,
    })).toThrow();
    expect(() => BrandingAddonProductPatchSchema.parse({
      purchase_notes: "说".repeat(501),
      version: 1,
    })).toThrow();
  });
});

describe("BrandingAddonCreateOrderSchema", () => {
  test("accepts only the fixed product code, a non-empty OpenID and UUID v4", () => {
    expect(BrandingAddonCreateOrderSchema.parse({
      product_code: "custom_support_branding_annual",
      payer_openid: "openid",
      idempotency_key: "00000000-0000-4000-8000-000000000001",
    })).toEqual({
      product_code: "custom_support_branding_annual",
      payer_openid: "openid",
      idempotency_key: "00000000-0000-4000-8000-000000000001",
    });

    expect(() => BrandingAddonCreateOrderSchema.parse({
      product_code: "custom_support_branding_annual",
      payer_openid: "openid",
      idempotency_key: "not-uuid-v4",
    })).toThrow();
    expect(() => BrandingAddonCreateOrderSchema.parse({
      product_code: "custom_support_branding_annual",
      payer_openid: "openid",
      idempotency_key: "00000000-0000-1000-8000-000000000001",
    })).toThrow();
    expect(() => BrandingAddonCreateOrderSchema.parse({
      product_code: "another-product",
      payer_openid: "openid",
      idempotency_key: "00000000-0000-4000-8000-000000000001",
    })).toThrow();
    expect(() => BrandingAddonCreateOrderSchema.parse({
      product_code: "custom_support_branding_annual",
      payer_openid: "   ",
      idempotency_key: "00000000-0000-4000-8000-000000000001",
    })).toThrow();
  });

  test("enforces the OpenID length boundary", () => {
    expect(BrandingAddonCreateOrderSchema.parse({
      product_code: "custom_support_branding_annual",
      payer_openid: "o".repeat(128),
      idempotency_key: "00000000-0000-4000-8000-000000000001",
    }).payer_openid).toHaveLength(128);
    expect(() => BrandingAddonCreateOrderSchema.parse({
      product_code: "custom_support_branding_annual",
      payer_openid: "o".repeat(129),
      idempotency_key: "00000000-0000-4000-8000-000000000001",
    })).toThrow();
  });
});

describe("BrandingAddonOrderListQuerySchema", () => {
  test("defaults pagination to page 1 and pageSize 20", () => {
    expect(BrandingAddonOrderListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  test("accepts at most 100 records per page", () => {
    expect(BrandingAddonOrderListQuerySchema.parse({
      page: "1",
      pageSize: "100",
    })).toEqual({
      page: 1,
      pageSize: 100,
    });
    expect(() => BrandingAddonOrderListQuerySchema.parse({
      page: 1,
      pageSize: 101,
    })).toThrow();
  });

  test("accepts a bounded tenant keyword", () => {
    expect(BrandingAddonOrderListQuerySchema.parse({
      keyword: "BA20260728",
    }).keyword).toBe("BA20260728");
    expect(() => BrandingAddonOrderListQuerySchema.parse({
      keyword: "x".repeat(121),
    })).toThrow();
    expect(() => BrandingAddonOrderListQuerySchema.parse({
      keyword: "(),\"%_\\",
    })).toThrow();
  });
});

describe("PlatformBrandingAddonOrderListQuerySchema", () => {
  test("freezes tenant, status, keyword and created-time filters", () => {
    expect(PlatformBrandingAddonOrderListQuerySchema.parse({
      tenant_id: "00000000-0000-4000-8000-000000000001",
      status: "paid",
      keyword: "BA20260728",
      created_from: "2026-07-01T00:00:00.000Z",
      created_to: "2026-07-31T23:59:59.999Z",
    })).toMatchObject({
      tenant_id: "00000000-0000-4000-8000-000000000001",
      status: "paid",
      keyword: "BA20260728",
      created_from: "2026-07-01T00:00:00.000Z",
      created_to: "2026-07-31T23:59:59.999Z",
    });
  });

  test("rejects invalid tenant and time filters", () => {
    expect(() => PlatformBrandingAddonOrderListQuerySchema.parse({
      tenant_id: "tenant-a",
    })).toThrow();
    expect(() => PlatformBrandingAddonOrderListQuerySchema.parse({
      created_from: "2026-07-01",
    })).toThrow();
    expect(() => PlatformBrandingAddonOrderListQuerySchema.parse({
      created_to: "not-a-time",
    })).toThrow();
    expect(() => PlatformBrandingAddonOrderListQuerySchema.parse({
      created_from: "2026-08-01T00:00:00.000Z",
      created_to: "2026-07-01T00:00:00.000Z",
    })).toThrow();
  });
});
