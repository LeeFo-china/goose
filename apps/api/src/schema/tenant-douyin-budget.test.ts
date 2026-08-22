import { describe, expect, test } from "bun:test";

import {
  TenantDouyinBudgetCreateDraftSchema,
  TenantDouyinBudgetUpdateFactorsSchema,
  TenantDouyinBudgetReplaceItemsSchema,
} from "./tenant-douyin-budget";

const baseItem = {
  role: "base" as const,
  category_code: "base" as const,
  item_code: "base.comfortable.rough" as const,
  label: "舒适档毛坯基础施工",
  unit: "sqm" as const,
  minimum_amount_fen: 90_000,
  maximum_amount_fen: 120_000,
  property_condition: "rough" as const,
  decoration_tier: "comfortable" as const,
  property_condition_coefficient_bps: 10_000,
  whole_house_coefficient_bps: 10_000,
  partial_coefficient_bps: 6_000,
  sort_order: 0,
  status: "active" as const,
};

describe("tenant douyin budget schemas", () => {
  test("accepts strict draft metadata and rejects inverted dates", () => {
    expect(TenantDouyinBudgetCreateDraftSchema.parse({
      effective_from: "2026-08-21T08:00:00.000Z",
      effective_to: null,
      disclaimer: "初步估算，不构成最终报价",
    }).disclaimer).toBe("初步估算，不构成最终报价");

    expect(() => TenantDouyinBudgetCreateDraftSchema.parse({
      effective_from: "2026-08-22T08:00:00.000Z",
      effective_to: "2026-08-21T08:00:00.000Z",
      disclaimer: "初步估算，不构成最终报价",
    })).toThrow();
  });

  test("accepts exact calculator adapter items in integer fen", () => {
    const result = TenantDouyinBudgetReplaceItemsSchema.parse({
      expected_updated_at: "2026-08-21T08:00:00.000Z",
      items: [baseItem, {
        category_code: "custom",
        item_code: "custom_cabinet",
        label: "定制柜体",
        unit: "fixed",
        minimum_amount_fen: 2_000_000,
        maximum_amount_fen: 3_000_000,
        role: "option",
        property_conditions: ["rough", "old_house"],
        decoration_tiers: ["economy", "comfortable", "quality"],
        decoration_scopes: ["whole_house", "partial"],
        sort_order: 1,
        status: "active",
      }],
    });
    expect(result.items[0]?.minimum_amount_fen).toBe(90_000);
  });

  test("accepts exact version-level layout and style factor payload", () => {
    const payload = {
      layout_coefficients_bps: {
        one_bedroom_one_living: 10_000,
        two_bedroom_one_living: 10_000,
        two_bedroom_two_living: 10_100,
        three_bedroom_one_living: 10_150,
        three_bedroom_two_living: 10_200,
        four_bedroom_two_living: 10_350,
        villa_duplex: 10_800,
        custom: 10_000,
      },
      style_coefficients_bps: {
        modern_simple: 10_000,
        cream: 10_300,
        new_chinese: 10_800,
        nordic: 10_200,
        light_luxury: 10_700,
        natural_wood: 10_300,
        american: 10_600,
        french: 10_800,
        wabi_sabi: 10_700,
        custom: 10_000,
      },
    };
    expect(TenantDouyinBudgetUpdateFactorsSchema.parse({
      expected_updated_at: "2026-08-21T08:00:00.000Z",
      factor_payload: payload,
    }).factor_payload).toEqual(payload);

    for (const factor_payload of [
      {
        ...payload,
        layout_coefficients_bps: {
          ...payload.layout_coefficients_bps,
          unknown: 10_000,
        },
      },
      {
        ...payload,
        style_coefficients_bps: {
          ...payload.style_coefficients_bps,
          cream: 0,
        },
      },
      {
        ...payload,
        style_coefficients_bps: {
          ...payload.style_coefficients_bps,
          cream: 100_001,
        },
      },
    ]) {
      expect(() => TenantDouyinBudgetUpdateFactorsSchema.parse({
        expected_updated_at: "2026-08-21T08:00:00.000Z",
        factor_payload,
      })).toThrow();
    }
  });

  test("rejects unsafe, duplicate, inverted and internally inconsistent items", () => {
    const cases = [
      [],
      [baseItem, { ...baseItem, sort_order: 1 }],
      [{ ...baseItem, maximum_amount_fen: 89_999 }],
      [{ ...baseItem, minimum_amount_fen: 1.5 }],
      [{ ...baseItem, item_code: "base.quality.rough" }],
      [{ ...baseItem, role: "option", item_code: "custom_cabinet" }],
      [{ ...baseItem, internal_expression: "tenant_id = body.tenant_id" }],
    ];

    for (const items of cases) {
      expect(() => TenantDouyinBudgetReplaceItemsSchema.parse({
        expected_updated_at: "2026-08-21T08:00:00.000Z",
        items,
      })).toThrow();
    }

    expect(() => TenantDouyinBudgetReplaceItemsSchema.parse({
      expected_updated_at: "2026-08-21T08:00:00.000Z",
      items: Array.from({ length: 101 }, (_, index) => ({
        ...baseItem,
        item_code: `base.economy.rough-${index}`,
        sort_order: index,
      })),
    })).toThrow();
  });
});
