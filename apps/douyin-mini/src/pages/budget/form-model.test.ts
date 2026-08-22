import { describe, expect, test } from "bun:test";

import type { DouyinBudgetPublicConfig } from "../../models";
import {
  BudgetFormValidationError,
  BUDGET_LAYOUT_CHOICES,
  BUDGET_STYLE_CHOICES,
  buildBudgetOptionViews,
  buildEstimateRequest,
  filterApplicableOptions,
  normalizeBudgetFormForConfig,
  reconcileSelectedOptions,
  selectBudgetTextChoice,
  updateBudgetSelection,
  type BudgetFormValue,
} from "./form-model";

const config: DouyinBudgetPublicConfig = {
  property_conditions: [
    { value: "rough", label: "毛坯" },
    { value: "old_house", label: "旧房翻新" },
  ],
  decoration_tiers: [
    { value: "economy", label: "经济" },
    { value: "comfortable", label: "舒适" },
    { value: "quality", label: "品质" },
  ],
  decoration_scopes: [
    { value: "whole_house", label: "全屋" },
    { value: "partial", label: "局部" },
  ],
  options: [
    {
      code: "demolition",
      label: "拆除",
      applicable_property_conditions: ["old_house"],
      applicable_decoration_tiers: ["economy", "comfortable", "quality"],
      applicable_decoration_scopes: ["whole_house", "partial"],
    },
    {
      code: "custom_cabinet",
      label: "定制柜体",
      applicable_property_conditions: ["rough", "old_house"],
      applicable_decoration_tiers: ["comfortable", "quality"],
      applicable_decoration_scopes: ["whole_house"],
    },
  ],
  pricing_version: "1",
  effective_from: "2026-08-20T00:00:00Z",
  effective_to: null,
  disclaimer: "初步估算，不构成最终报价",
};

const form: BudgetFormValue = {
  areaText: "110",
  propertyCondition: "rough",
  decorationTier: "comfortable",
  decorationScope: "whole_house",
  layout: "",
  style: "",
  selectedOptions: ["custom_cabinet", "custom_cabinet"],
  demand: "  需要收纳  ",
};

describe("budget form model", () => {
  test("offers common layout and style choices with a custom fallback", () => {
    expect(BUDGET_LAYOUT_CHOICES.map((choice) => choice.label)).toEqual([
      "一室一厅",
      "两室一厅",
      "两室两厅",
      "三室一厅",
      "三室两厅",
      "四室两厅",
      "别墅/复式",
      "自定义",
    ]);
    expect(BUDGET_STYLE_CHOICES.map((choice) => choice.label)).toEqual([
      "现代简约",
      "奶油风",
      "新中式",
      "北欧",
      "轻奢",
      "原木风",
      "美式",
      "法式",
      "侘寂风",
      "自定义",
    ]);
    expect(selectBudgetTextChoice(BUDGET_LAYOUT_CHOICES, "4", "旧值"))
      .toEqual({ value: "三室两厅", code: "three_bedroom_two_living", isCustom: false });
    expect(selectBudgetTextChoice(BUDGET_STYLE_CHOICES, "9", "  自定义风格  "))
      .toEqual({ value: "自定义风格", code: "custom", isCustom: true });
  });

  test("normalizes a bounded form into the public estimate request", () => {
    expect(buildEstimateRequest(form)).toEqual({
      area: 110,
      property_condition: "rough",
      decoration_tier: "comfortable",
      decoration_scope: "whole_house",
      option_codes: [],
      demand: "需要收纳",
    });

    expect(buildEstimateRequest({
      ...form,
      layout: "  三室两厅 ",
      style: " 现代简约 ",
      demand: "   ",
    })).toMatchObject({
      layout_code: "three_bedroom_two_living",
      layout: "三室两厅",
      style_code: "modern_simple",
      style: "现代简约",
    });

    expect(buildEstimateRequest({
      ...form,
      layout: "loft 自定义",
      style: "混搭自定义",
      demand: "   ",
    })).toMatchObject({
      layout_code: "custom",
      layout: "loft 自定义",
      style_code: "custom",
      style: "混搭自定义",
    });
  });

  test("rejects area, option and optional-text boundaries", () => {
    const invalidForms: BudgetFormValue[] = [
      { ...form, areaText: "" },
      { ...form, areaText: "9.99" },
      { ...form, areaText: "1000.01" },
      { ...form, areaText: "110㎡" },
      { ...form, layout: "x".repeat(41) },
      { ...form, demand: "x".repeat(1_001) },
      { ...form, decorationScope: "partial", selectedOptions: ["unknown"] as never },
    ];
    for (const invalid of invalidForms) {
      expect(() => buildEstimateRequest(invalid)).toThrow(BudgetFormValidationError);
    }
  });

  test("filters options across condition, tier and scope", () => {
    expect(filterApplicableOptions(config, form).map((option) => option.code))
      .toEqual([]);
    expect(filterApplicableOptions(config, {
      ...form,
      propertyCondition: "old_house",
      decorationScope: "partial",
    }).map((option) => option.code)).toEqual(["demolition"]);
  });

  test("shows and submits options only for partial decoration scope", () => {
    expect(reconcileSelectedOptions(config, {
      ...form,
      selectedOptions: ["custom_cabinet", "demolition"],
    })).toEqual([]);

    expect(updateBudgetSelection(config, form, "decorationScope", "partial"))
      .toMatchObject({ decorationScope: "partial", selectedOptions: [] });
    expect(updateBudgetSelection(config, form, "propertyCondition", "old_house"))
      .toMatchObject({ propertyCondition: "old_house" });
    expect(buildBudgetOptionViews(config, form)).toEqual([]);
    expect(buildEstimateRequest({
      ...form,
      decorationScope: "whole_house",
      selectedOptions: ["custom_cabinet"],
    }).option_codes).toEqual([]);
  });

  test("reconciles a refreshed config and builds selected option views", () => {
    const refreshed = {
      ...config,
      pricing_version: "2",
      options: config.options.filter((option) => option.code !== "custom_cabinet"),
    };
    const normalized = normalizeBudgetFormForConfig(refreshed, form);
    expect(normalized.selectedOptions).toEqual([]);
    expect(buildBudgetOptionViews(config, form)).toEqual([]);
  });
});
