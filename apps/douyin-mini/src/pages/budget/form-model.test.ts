import { describe, expect, test } from "bun:test";

import type { DouyinBudgetPublicConfig } from "../../models";
import {
  BudgetFormValidationError,
  buildEstimateRequest,
  filterApplicableOptions,
  reconcileSelectedOptions,
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
  test("normalizes a bounded form into the public estimate request", () => {
    expect(buildEstimateRequest(form)).toEqual({
      area: 110,
      property_condition: "rough",
      decoration_tier: "comfortable",
      decoration_scope: "whole_house",
      option_codes: ["custom_cabinet"],
      demand: "需要收纳",
    });

    expect(buildEstimateRequest({
      ...form,
      layout: "  三室两厅 ",
      style: " 现代简约 ",
      demand: "   ",
    })).toMatchObject({ layout: "三室两厅", style: "现代简约" });
  });

  test("rejects area, option and optional-text boundaries", () => {
    for (const invalid of [
      { ...form, areaText: "" },
      { ...form, areaText: "9.99" },
      { ...form, areaText: "1000.01" },
      { ...form, areaText: "110㎡" },
      { ...form, layout: "x".repeat(41) },
      { ...form, demand: "x".repeat(1_001) },
      { ...form, selectedOptions: ["unknown"] as never },
    ]) {
      expect(() => buildEstimateRequest(invalid)).toThrow(BudgetFormValidationError);
    }
  });

  test("filters options across condition, tier and scope", () => {
    expect(filterApplicableOptions(config, form).map((option) => option.code))
      .toEqual(["custom_cabinet"]);
    expect(filterApplicableOptions(config, {
      ...form,
      propertyCondition: "old_house",
      decorationScope: "partial",
    }).map((option) => option.code)).toEqual(["demolition"]);
  });

  test("clears selected options that become inapplicable", () => {
    expect(reconcileSelectedOptions(config, {
      ...form,
      selectedOptions: ["custom_cabinet", "demolition"],
    })).toEqual(["custom_cabinet"]);

    expect(updateBudgetSelection(config, form, "decorationScope", "partial"))
      .toMatchObject({ decorationScope: "partial", selectedOptions: [] });
    expect(updateBudgetSelection(config, form, "propertyCondition", "old_house"))
      .toMatchObject({ propertyCondition: "old_house" });
  });
});
