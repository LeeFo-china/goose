import { describe, expect, test } from "bun:test";

import {
  BrandingAddonCreateOrderSchema,
  BrandingAddonOrderListQuerySchema,
  BrandingAddonProductPatchSchema,
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
});
