import { describe, expect, test } from "bun:test";

import {
  BUDGET_PRICING_PAGE_SIZE,
  buildPricingItemsPayload,
  calculatePricingPreview,
  createBudgetPricingFailurePage,
  createBudgetPricingPageTarget,
  createBudgetPricingRequestAuthority,
  createEmptyPricingEditorItem,
  getBudgetPricingViewState,
  getPricingDraftWarnings,
  getPricingItemWarnings,
  normalizePricingVersion,
  normalizePricingVersionPage,
  pricingStatusDisplay,
  pricingItemToEditor,
  toggleCanonicalCondition,
  yuanInputToFen,
  type BudgetPricingItem,
  type BudgetPricingVersion,
} from "./budget-pricing-logic";

const baseItem: BudgetPricingItem = {
  role: "base",
  category_code: "base",
  item_code: "base.comfortable.rough",
  label: "舒适档毛坯基础施工",
  unit: "sqm",
  minimum_amount_fen: 90_000,
  maximum_amount_fen: 120_000,
  property_condition: "rough",
  decoration_tier: "comfortable",
  property_condition_coefficient_bps: 10_000,
  whole_house_coefficient_bps: 10_000,
  partial_coefficient_bps: 6_000,
  sort_order: 0,
  status: "active",
};

const version: BudgetPricingVersion = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "22222222-2222-4222-8222-222222222222",
  version_no: 3,
  status: "draft",
  effective_from: "2026-08-22T00:00:00.000Z",
  effective_to: null,
  currency: "CNY",
  disclaimer: "初步估算，不构成最终报价",
  created_by_employee_id: "33333333-3333-4333-8333-333333333333",
  created_at: "2026-08-21T00:00:00.000Z",
  updated_at: "2026-08-21T00:00:00.000Z",
  items: [baseItem],
};

describe("douyin budget pricing admin logic", () => {
  test("normalizes a strict paginated wire response and rejects pagination drift", () => {
    expect(normalizePricingVersionPage({
      active_version: null,
      list: [version],
      pagination: { page: 2, pageSize: BUDGET_PRICING_PAGE_SIZE, total: 21, totalPages: 2 },
    }, { page: 2, pageSize: BUDGET_PRICING_PAGE_SIZE })?.list[0]).toEqual(version);
    expect(normalizePricingVersionPage({
      active_version: null,
      list: [version],
      pagination: { page: 1, pageSize: BUDGET_PRICING_PAGE_SIZE, total: 21, totalPages: 2 },
    }, { page: 2, pageSize: BUDGET_PRICING_PAGE_SIZE })).toBeNull();
    expect(normalizePricingVersionPage({
      active_version: version,
      list: [version],
      pagination: { page: 2, pageSize: BUDGET_PRICING_PAGE_SIZE, total: 21, totalPages: 2 },
    }, { page: 2, pageSize: BUDGET_PRICING_PAGE_SIZE })).toBeNull();
    expect(normalizePricingVersion({ ...version, internal_note: "不可见" })).toBeNull();
    expect(normalizePricingVersion({
      ...version,
      items: [{ ...baseItem, condition_payload: { expression: "cost * margin" } }],
    })).toBeNull();
    expect(normalizePricingVersion({
      ...version,
      items: [baseItem, { ...baseItem, sort_order: 1 }],
    })).toBeNull();
  });

  test("converts yuan text to integer fen only at the request boundary", () => {
    expect(yuanInputToFen("900")).toEqual({ ok: true, value: 90_000 });
    expect(yuanInputToFen(" 900.25 ")).toEqual({ ok: true, value: 90_025 });
    expect(yuanInputToFen("0.1")).toEqual({ ok: true, value: 10 });
    expect(yuanInputToFen("1.001")).toEqual({ ok: false, message: "金额最多保留两位小数" });
    expect(yuanInputToFen("-1").ok).toBe(false);
    expect(yuanInputToFen("").ok).toBe(false);
  });

  test("keeps empty items free of invented prices and builds the closed wire payload", () => {
    const empty = createEmptyPricingEditorItem("base.comfortable.rough", 0);
    expect(empty.minimum_amount_yuan).toBe("");
    expect(empty.maximum_amount_yuan).toBe("");

    const editor = pricingItemToEditor(baseItem);
    expect(editor.minimum_amount_yuan).toBe("900");
    expect(editor.maximum_amount_yuan).toBe("1200");
    const payload = buildPricingItemsPayload(version.updated_at, [editor]);
    expect(payload).toEqual({
      expected_updated_at: version.updated_at,
      items: [baseItem],
    });
    expect(JSON.stringify(payload)).not.toContain("condition_payload");
  });

  test("summarizes metadata, coverage and amount validation before save or activation", () => {
    expect(getPricingDraftWarnings({
      effective_from: "2026-08-22T00:00",
      effective_to: "2026-08-21T00:00",
      disclaimer: "",
    })).toEqual([
      "报价失效时间必须晚于生效时间",
      "请填写免责声明",
    ]);

    const editor = pricingItemToEditor(baseItem);
    expect(getPricingItemWarnings([editor], { requireActivationCoverage: false })).toEqual([]);
    expect(getPricingItemWarnings([editor], { requireActivationCoverage: true })).toEqual([
      "启用前需配置经济、舒适、品质档在毛坯和旧房翻新下的 6 条基础报价",
    ]);
    expect(getPricingItemWarnings([{
      ...editor,
      minimum_amount_yuan: "1200",
      maximum_amount_yuan: "900",
    }], { requireActivationCoverage: false })).toContain("舒适档毛坯基础施工的最低价不能高于最高价");
    expect(getPricingItemWarnings([{
      ...editor,
      whole_house_coefficient_bps: 0,
    }], { requireActivationCoverage: false })).toContain("舒适档毛坯基础施工的全屋系数必须大于 0");
    expect(getPricingItemWarnings([
      editor,
      { ...createEmptyPricingEditorItem("custom_cabinet", 1), label: editor.label,
        minimum_amount_yuan: "1", maximum_amount_yuan: "2" },
    ], { requireActivationCoverage: false })).toContain("报价项目名称不能重复");
  });

  test("uses the existing deterministic calculator for the 100 sqm preview", () => {
    expect(calculatePricingPreview([pricingItemToEditor(baseItem)])).toEqual({
      ok: true,
      minimumTotalYuan: 90_000,
      maximumTotalYuan: 120_000,
    });
  });

  test("aborts stale requests and keeps loading, error and empty states exclusive", () => {
    const authority = createBudgetPricingRequestAuthority();
    const first = authority.begin();
    const second = authority.begin();
    expect(first.controller.signal.aborted).toBe(true);
    expect(authority.isCurrent(first)).toBe(false);
    expect(authority.isCurrent(second)).toBe(true);

    expect(getBudgetPricingViewState({ loading: true, error: null, count: 0 })).toBe("loading");
    expect(getBudgetPricingViewState({ loading: false, error: "失败", count: 0 })).toBe("error");
    expect(getBudgetPricingViewState({ loading: false, error: null, count: 0 })).toBe("empty");
    expect(getBudgetPricingViewState({ loading: false, error: null, count: 1 })).toBe("ready");
  });

  test("rejects an old GET that resolves after a mutation takes request authority", async () => {
    const authority = createBudgetPricingRequestAuthority();
    const oldGet = authority.begin();
    let resolveOldGet!: (value: string) => void;
    const oldGetResult = new Promise<string>((resolve) => { resolveOldGet = resolve; });

    const mutation = authority.begin();
    resolveOldGet("stale page");

    expect(await oldGetResult).toBe("stale page");
    expect(oldGet.controller.signal.aborted).toBe(true);
    expect(authority.isCurrent(oldGet)).toBe(false);
    expect(authority.isCurrent(mutation)).toBe(true);
  });

  test("preserves the latest pagination target and clears stale active state after refresh failure", () => {
    const target = createBudgetPricingPageTarget(2);
    target.update(3);
    expect(target.current()).toBe(3);

    expect(createBudgetPricingFailurePage({ page: target.current(), pageSize: 20 })).toEqual({
      active_version: null,
      list: [],
      pagination: { page: 3, pageSize: 20, total: 0, totalPages: 0 },
    });
  });

  test("keeps structured applicability filters in canonical order", () => {
    const order = ["rough", "old_house"] as const;
    expect(toggleCanonicalCondition(["old_house"], "rough", true, order)).toEqual([
      "rough",
      "old_house",
    ]);
    expect(toggleCanonicalCondition(["rough", "old_house"], "rough", false, order))
      .toEqual(["old_house"]);
  });

  test("labels raw active history from the authoritative effective version", () => {
    expect(pricingStatusDisplay("active", true)).toEqual({
      label: "使用中",
      variant: "success",
    });
    expect(pricingStatusDisplay("active", false)).toEqual({
      label: "已启用但当前失效",
      variant: "outline",
    });
    expect(pricingStatusDisplay("draft", false).label).toBe("草稿");
    expect(pricingStatusDisplay("archived", false).label).toBe("已归档");
  });
});
