import { describe, expect, test } from "bun:test";

import {
  BrandingAddonCreateOrderSchema,
  BrandingAddonOrderListQuerySchema,
  BrandingAddonProductPatchSchema,
  BrandingVirtualProductEnvironmentParamsSchema,
  BrandingVirtualProductPatchSchema,
  BrandingVirtualCreateOrderSchema,
  BrandingVirtualProductValidationSchema,
  PlatformBrandingAddonOrderListQuerySchema,
} from "./branding-addon";

describe("BrandingVirtualCreateOrderSchema", () => {
  const valid = {
    product_code: "custom_support_branding_annual",
    idempotency_key: "00000000-0000-4000-8000-000000000001",
  } as const;

  test("defaults the diagnostic platform without accepting price or server context", () => {
    expect(BrandingVirtualCreateOrderSchema.parse(valid)).toEqual({
      ...valid,
      requested_platform: "unknown",
    });
    expect(BrandingVirtualCreateOrderSchema.parse({
      ...valid,
      requested_platform: "ios",
    }).requested_platform).toBe("ios");

    for (const forged of [
      { amount_fen: 1 },
      { environment: "sandbox" },
      { offer_id: "client-offer" },
      { provider_product_id: "client-product" },
      { payer_openid: "client-openid" },
      { tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      { created_by: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      { appKey: "secret" },
    ]) {
      expect(() => BrandingVirtualCreateOrderSchema.parse({
        ...valid,
        ...forged,
      })).toThrow();
    }
  });

  test("rejects unsupported platforms and non-v4 idempotency keys", () => {
    expect(() => BrandingVirtualCreateOrderSchema.parse({
      ...valid,
      requested_platform: "macos",
    })).toThrow();
    expect(() => BrandingVirtualCreateOrderSchema.parse({
      ...valid,
      idempotency_key: "00000000-0000-1000-8000-000000000001",
    })).toThrow();
  });
});

describe("BrandingVirtualProductValidationSchema", () => {
  test("accepts only a supported environment and positive mapping version", () => {
    expect(BrandingVirtualProductEnvironmentParamsSchema.parse({
      environment: "production",
    })).toEqual({ environment: "production" });
    expect(BrandingVirtualProductValidationSchema.parse({ version: 1 }))
      .toEqual({ version: 1 });
    expect(() => BrandingVirtualProductEnvironmentParamsSchema.parse({
      environment: "staging",
    })).toThrow();
    expect(() => BrandingVirtualProductValidationSchema.parse({
      version: 0,
    })).toThrow();
  });

  test("matches the PostgreSQL integer upper boundary", () => {
    expect(BrandingVirtualProductValidationSchema.parse({
      version: 2_147_483_647,
    })).toEqual({ version: 2_147_483_647 });

    const result = BrandingVirtualProductValidationSchema.safeParse({
      version: 2_147_483_648,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        message: "版本号超出支持范围",
      }));
    }
  });
});

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
    ] as const) {
      expect(BrandingAddonProductPatchSchema.parse({
        ...patch,
        version: 1,
      })).toEqual({
        ...patch,
        version: 1,
      });
    }
  });

  test("strictly rejects the purchase mode field", () => {
    expect(() => BrandingAddonProductPatchSchema.parse({
      name: "年度品牌技术支持",
      purchase_mode: "maintenance",
      version: 1,
    })).toThrow();
  });

  test("strictly rejects the virtual product field", () => {
    expect(() => BrandingAddonProductPatchSchema.parse({
      name: "年度品牌技术支持",
      virtual_product: {
        environment: "production",
        app_id: "wx-app",
        virtual_merchant_id: "merchant",
        offer_id: "offer",
        provider_product_id: "product",
        expected_amount_fen: 9_900,
        encrypted_secret_ref:
          "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
        secret_revision: 2,
        status: "active",
        version: 1,
      },
      version: 1,
    })).toThrow();
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

  test("matches the PostgreSQL integer upper boundary for prices", () => {
    expect(BrandingAddonProductPatchSchema.parse({
      amount_fen: 2_147_483_647,
      version: 1,
    }).amount_fen).toBe(2_147_483_647);

    for (const amount_fen of [2_147_483_648, 3_000_000_000]) {
      expect(() => BrandingAddonProductPatchSchema.parse({
        amount_fen,
        version: 1,
      })).toThrow();
    }
  });

  test("matches the PostgreSQL integer boundary for command versions", () => {
    expect(BrandingAddonProductPatchSchema.parse({
      name: "年度品牌技术支持",
      version: 2_147_483_647,
    }).version).toBe(2_147_483_647);

    const result = BrandingAddonProductPatchSchema.safeParse({
      version: 2_147_483_648,
      name: "年度品牌技术支持",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        message: "版本号超出支持范围",
      }));
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

describe("BrandingVirtualProductPatchSchema", () => {
  test("rejects cross-environment virtual payment secret references", () => {
    expect(() => BrandingVirtualProductPatchSchema.parse({
      environment: "production",
      app_id: "wx-app",
      virtual_merchant_id: "merchant",
      offer_id: "offer",
      provider_product_id: "product",
      expected_amount_fen: 9_900,
      encrypted_secret_ref:
        "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
      secret_revision: 2,
      status: "active",
      version: 1,
    })).toThrow();
  });

  test("matches PostgreSQL integer boundaries for mapping versions", () => {
    const virtualProduct = {
      environment: "production" as const,
      app_id: "wx-app",
      virtual_merchant_id: "merchant",
      offer_id: "offer",
      provider_product_id: "product",
      expected_amount_fen: 9_900,
      encrypted_secret_ref:
        "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE" as const,
      secret_revision: 2_147_483_647,
      status: "draft" as const,
      version: 2_147_483_647,
    };
    expect(BrandingVirtualProductPatchSchema.parse(virtualProduct))
      .toEqual(virtualProduct);

    for (const input of [
      { ...virtualProduct, secret_revision: 2_147_483_648 },
      { ...virtualProduct, version: 2_147_483_648 },
    ]) {
      const result = BrandingVirtualProductPatchSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(
          (issue) => issue.message.includes("超出支持范围"),
        )).toBe(true);
      }
    }
  });

  test("accepts only stable HTTPS JPG or PNG item URLs", () => {
    const virtualProduct = {
      environment: "production" as const,
      app_id: "wx-app",
      virtual_merchant_id: "merchant",
      offer_id: "offer",
      provider_product_id: "product",
      item_url: "https://cdn.example.test/branding.png?version=2",
      expected_amount_fen: 9_900,
      encrypted_secret_ref:
        "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE" as const,
      secret_revision: 2,
      status: "draft" as const,
      version: 1,
    };

    expect(BrandingVirtualProductPatchSchema.parse(virtualProduct))
      .toEqual(virtualProduct);
    for (const item_url of [
      "http://cdn.example.test/branding.png",
      "https://cdn.example.test/branding.webp",
      "data:image/png;base64,abc",
    ]) {
      expect(BrandingVirtualProductPatchSchema.safeParse({
        ...virtualProduct,
        item_url,
      }).success).toBe(false);
    }
  });
});

describe("BrandingAddonCreateOrderSchema", () => {
  test("accepts only the fixed product code and UUID v4", () => {
    expect(BrandingAddonCreateOrderSchema.parse({
      product_code: "custom_support_branding_annual",
      idempotency_key: "00000000-0000-4000-8000-000000000001",
    })).toEqual({
      product_code: "custom_support_branding_annual",
      idempotency_key: "00000000-0000-4000-8000-000000000001",
    });

    expect(() => BrandingAddonCreateOrderSchema.parse({
      product_code: "custom_support_branding_annual",
      idempotency_key: "not-uuid-v4",
    })).toThrow();
    expect(() => BrandingAddonCreateOrderSchema.parse({
      product_code: "custom_support_branding_annual",
      idempotency_key: "00000000-0000-1000-8000-000000000001",
    })).toThrow();
    expect(() => BrandingAddonCreateOrderSchema.parse({
      product_code: "another-product",
      idempotency_key: "00000000-0000-4000-8000-000000000001",
    })).toThrow();
  });

  test("rejects client-supplied payer and tenant identity", () => {
    expect(() => BrandingAddonCreateOrderSchema.parse({
      product_code: "custom_support_branding_annual",
      payer_openid: "client-controlled-openid",
      tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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

  test("rejects client-supplied tenant identity", () => {
    expect(() => BrandingAddonOrderListQuerySchema.parse({
      tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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

  test("accepts independent unified order status filters", () => {
    expect(BrandingAddonOrderListQuerySchema.parse({
      payment_channel: "wechat_virtual",
      payment_status: "succeeded",
      fulfillment_status: "granted",
      refund_status: "none",
    })).toMatchObject({
      payment_channel: "wechat_virtual",
      payment_status: "succeeded",
      fulfillment_status: "granted",
      refund_status: "none",
    });
    expect(() => BrandingAddonOrderListQuerySchema.parse({
      payment_channel: "wechat_pay",
    })).toThrow();
    expect(() => BrandingAddonOrderListQuerySchema.parse({
      payment_status: "paid",
    })).toThrow();
  });

  test("allows equivalent legacy and unified payment statuses", () => {
    expect(BrandingAddonOrderListQuerySchema.parse({
      status: "paid",
      payment_status: "succeeded",
    })).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
    });
    expect(PlatformBrandingAddonOrderListQuerySchema.parse({
      status: "pending",
      payment_status: "pending",
    })).toMatchObject({
      status: "pending",
      payment_status: "pending",
    });
  });

  test("rejects conflicting legacy and unified payment statuses", () => {
    expect(() => BrandingAddonOrderListQuerySchema.parse({
      status: "paid",
      payment_status: "closed",
    })).toThrow();
    expect(() => PlatformBrandingAddonOrderListQuerySchema.parse({
      status: "failed",
      payment_status: "pending",
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
