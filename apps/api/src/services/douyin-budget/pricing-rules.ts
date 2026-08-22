import {
  DOUYIN_BUDGET_CATEGORY_CODE_VALUES,
  DOUYIN_BUDGET_LAYOUT_CODE_VALUES,
  DOUYIN_BUDGET_OPTION_CODE_VALUES,
  DOUYIN_BUDGET_STYLE_CODE_VALUES,
  DOUYIN_DECORATION_SCOPE_VALUES,
  DOUYIN_DECORATION_TIER_VALUES,
  DOUYIN_PROPERTY_CONDITION_VALUES,
  DouyinBudgetPublicConfigSchema,
  type DouyinBudgetCategoryCode,
  type DouyinBudgetEstimateRequest,
  type DouyinBudgetPublicConfig,
} from "@gooes/domain";
import { z } from "zod";

import type {
  DouyinBudgetPricingItemRecord,
  DouyinBudgetPricingVersionRecord,
} from "@/repositories/douyin-budget";

import {
  DouyinBudgetCalculationError,
  MAX_DOUYIN_BUDGET_COEFFICIENT_BPS,
  type DouyinBudgetPricingItem,
  type DouyinBudgetPricingRules,
} from "./calculator";

export type ActiveDouyinBudgetPricing = {
  readonly version: DouyinBudgetPricingVersionRecord;
  readonly items: readonly DouyinBudgetPricingItemRecord[];
};

const PROPERTY_LABELS = {
  rough: "毛坯",
  old_house: "旧房翻新",
} as const;
const TIER_LABELS = {
  economy: "经济",
  comfortable: "舒适",
  quality: "品质",
} as const;
const SCOPE_LABELS = {
  whole_house: "全屋",
  partial: "局部",
} as const;
const CATEGORY_LABELS = {
  base: "基础施工",
  water_electricity: "水电",
  materials: "主材",
  custom: "定制",
  other: "其他",
} as const;
const LAYOUT_LABELS = {
  one_bedroom_one_living: "一室一厅",
  two_bedroom_one_living: "两室一厅",
  two_bedroom_two_living: "两室两厅",
  three_bedroom_one_living: "三室一厅",
  three_bedroom_two_living: "三室两厅",
  four_bedroom_two_living: "四室两厅",
  villa_duplex: "别墅/复式",
  custom: "自定义户型",
} as const;
const STYLE_LABELS = {
  modern_simple: "现代简约",
  cream: "奶油风",
  new_chinese: "新中式",
  nordic: "北欧",
  light_luxury: "轻奢",
  natural_wood: "原木风",
  american: "美式",
  french: "法式",
  wabi_sabi: "侘寂风",
  custom: "自定义风格",
} as const;

const ConditionPropertyArraySchema = canonicalArray(
  DOUYIN_PROPERTY_CONDITION_VALUES,
);
const ConditionTierArraySchema = canonicalArray(
  DOUYIN_DECORATION_TIER_VALUES,
);
const ConditionScopeArraySchema = canonicalArray(
  DOUYIN_DECORATION_SCOPE_VALUES,
);
const CoefficientSchema = z.int().min(1).max(
  MAX_DOUYIN_BUDGET_COEFFICIENT_BPS,
);
const FactorPayloadSchema = z.strictObject({
  layout_coefficients_bps: z.strictObject(Object.fromEntries(
    DOUYIN_BUDGET_LAYOUT_CODE_VALUES.map((code) => [code, CoefficientSchema]),
  ) as Record<(typeof DOUYIN_BUDGET_LAYOUT_CODE_VALUES)[number], typeof CoefficientSchema>),
  style_coefficients_bps: z.strictObject(Object.fromEntries(
    DOUYIN_BUDGET_STYLE_CODE_VALUES.map((code) => [code, CoefficientSchema]),
  ) as Record<(typeof DOUYIN_BUDGET_STYLE_CODE_VALUES)[number], typeof CoefficientSchema>),
});
const BaseConditionSchema = z.strictObject({
  role: z.literal("base"),
  property_conditions: z.tuple([z.enum(DOUYIN_PROPERTY_CONDITION_VALUES)]),
  decoration_tiers: z.tuple([z.enum(DOUYIN_DECORATION_TIER_VALUES)]),
  decoration_scopes: z.tuple([
    z.literal("whole_house"),
    z.literal("partial"),
  ]),
  property_condition_coefficient_bps: CoefficientSchema,
  decoration_scope_coefficient_bps: z.strictObject({
    whole_house: CoefficientSchema,
    partial: CoefficientSchema,
  }),
});
const OptionConditionSchema = z.strictObject({
  role: z.literal("option"),
  property_conditions: ConditionPropertyArraySchema.optional(),
  decoration_tiers: ConditionTierArraySchema.optional(),
  decoration_scopes: ConditionScopeArraySchema.optional(),
});

export function toDouyinBudgetCalculatorRules(
  pricing: ActiveDouyinBudgetPricing,
): DouyinBudgetPricingRules {
  const items = pricing.items.map(toCalculatorItem);
  const codes = new Set<string>();
  const labels = new Set<string>();
  for (const item of items) {
    if (codes.has(item.code)) {
      fail("DOUYIN_BUDGET_RULE_CODE_DUPLICATE", "报价规则编码不能重复");
    }
    if (labels.has(item.label)) {
      fail("DOUYIN_BUDGET_RULE_INVALID", "报价项目名称不能重复");
    }
    codes.add(item.code);
    labels.add(item.label);
  }
  return {
    versionId: pricing.version.id,
    versionNo: pricing.version.version_no,
    disclaimer: pricing.version.disclaimer,
    factorPayload: toFactorPayload(pricing.version.factor_payload),
    items,
  };
}

export function buildDouyinBudgetPublicConfig(
  pricing: ActiveDouyinBudgetPricing,
): DouyinBudgetPublicConfig {
  const rules = toDouyinBudgetCalculatorRules(pricing);
  const optionsByCode = new Map(
    rules.items
      .filter((item) => item.role === "option")
      .map((item) => [item.code, item]),
  );
  const parsed = DouyinBudgetPublicConfigSchema.safeParse({
    property_conditions: DOUYIN_PROPERTY_CONDITION_VALUES.map((value) => ({
      value,
      label: PROPERTY_LABELS[value],
    })),
    decoration_tiers: DOUYIN_DECORATION_TIER_VALUES.map((value) => ({
      value,
      label: TIER_LABELS[value],
    })),
    decoration_scopes: DOUYIN_DECORATION_SCOPE_VALUES.map((value) => ({
      value,
      label: SCOPE_LABELS[value],
    })),
    options: DOUYIN_BUDGET_OPTION_CODE_VALUES.flatMap((code) => {
      const option = optionsByCode.get(code);
      return option ? [{
        code,
        label: option.label,
        applicable_property_conditions: [
          ...(option.condition.propertyConditions ??
            DOUYIN_PROPERTY_CONDITION_VALUES),
        ],
        applicable_decoration_tiers: [
          ...(option.condition.decorationTiers ?? DOUYIN_DECORATION_TIER_VALUES),
        ],
        applicable_decoration_scopes: [
          ...(option.condition.decorationScopes ?? DOUYIN_DECORATION_SCOPE_VALUES),
        ],
      }] : [];
    }),
    pricing_version: String(pricing.version.version_no),
    effective_from: normalizedDateTime(pricing.version.effective_from),
    effective_to: pricing.version.effective_to
      ? normalizedDateTime(pricing.version.effective_to)
      : null,
    disclaimer: pricing.version.disclaimer,
  });
  if (!parsed.success) {
    fail("DOUYIN_BUDGET_RULE_INVALID", "预算公开配置无效");
  }
  return parsed.data;
}

export function douyinBudgetPublicPricingMetadata(
  version: DouyinBudgetPricingVersionRecord,
) {
  return {
    pricing_version: String(version.version_no),
    pricing_effective_from: normalizedDateTime(version.effective_from),
    pricing_effective_to: version.effective_to
      ? normalizedDateTime(version.effective_to)
      : null,
    disclaimer: version.disclaimer,
  };
}

export function buildDouyinBudgetCalculationBasis(
  input: DouyinBudgetEstimateRequest,
  rules: DouyinBudgetPricingRules,
): string[] {
  const basis = [
    `${input.area}㎡、${TIER_LABELS[input.decoration_tier]}档、${
      PROPERTY_LABELS[input.property_condition]
    }房、${SCOPE_LABELS[input.decoration_scope]}装修`,
  ];
  if (input.option_codes.length > 0) {
    const labels = new Map(
      rules.items
        .filter((item) => item.role === "option")
        .map((item) => [item.code, item.label]),
    );
    basis.push(
      `选配项目：${input.option_codes.map((code) => labels.get(code) ?? code).join("、")}`,
    );
  }
  if (input.layout_code === "custom") {
    basis.push("自定义户型用于量房沟通，预算按基础复杂度计算");
  } else if (input.layout_code) {
    const coefficient =
      rules.factorPayload.layoutCoefficientsBps[input.layout_code];
    basis.push(
      `户型复杂度：${LAYOUT_LABELS[input.layout_code]} ×${formatCoefficient(coefficient)}`,
    );
  }
  if (input.style_code === "custom") {
    basis.push("自定义风格用于方案沟通，预算按基础复杂度计算");
  } else if (input.style_code) {
    const coefficient =
      rules.factorPayload.styleCoefficientsBps[input.style_code];
    basis.push(
      `风格复杂度：${STYLE_LABELS[input.style_code]} ×${formatCoefficient(coefficient)}`,
    );
  }
  return basis;
}

export function douyinBudgetCategoryLabel(
  categoryCode: DouyinBudgetCategoryCode,
): string {
  return CATEGORY_LABELS[categoryCode];
}

function toCalculatorItem(
  item: DouyinBudgetPricingItemRecord,
): DouyinBudgetPricingItem {
  const category = z.enum(DOUYIN_BUDGET_CATEGORY_CODE_VALUES).safeParse(
    item.category_code,
  );
  if (!category.success) {
    fail("DOUYIN_BUDGET_RULE_INVALID", "报价项目分类无效");
  }
  if (!isRecord(item.condition_payload)) conditionFail();
  if (item.condition_payload.role === "base") {
    const condition = BaseConditionSchema.safeParse(item.condition_payload);
    if (!condition.success || item.unit !== "sqm" || category.data !== "base") {
      conditionFail();
    }
    const propertyCondition = condition.data.property_conditions[0];
    const decorationTier = condition.data.decoration_tiers[0];
    const expectedCode = `base.${decorationTier}.${propertyCondition}` as const;
    if (item.item_code !== expectedCode) conditionFail();
    return {
      role: "base",
      code: expectedCode,
      category: "base",
      label: item.label,
      unit: "sqm",
      minimumAmountFen: item.minimum_amount,
      maximumAmountFen: item.maximum_amount,
      condition: {
        propertyConditions: [propertyCondition],
        decorationTiers: [decorationTier],
        decorationScopes: [...condition.data.decoration_scopes],
      },
      propertyConditionCoefficientBps:
        condition.data.property_condition_coefficient_bps,
      decorationScopeCoefficientBps: {
        ...condition.data.decoration_scope_coefficient_bps,
      },
    };
  }
  if (item.condition_payload.role === "option") {
    const condition = OptionConditionSchema.safeParse(item.condition_payload);
    const optionCode = z.enum(DOUYIN_BUDGET_OPTION_CODE_VALUES).safeParse(
      item.item_code,
    );
    const unit = z.enum(["sqm", "fixed"]).safeParse(item.unit);
    if (!condition.success || !optionCode.success || !unit.success) {
      conditionFail();
    }
    return {
      role: "option",
      code: optionCode.data,
      category: category.data,
      label: item.label,
      unit: unit.data,
      minimumAmountFen: item.minimum_amount,
      maximumAmountFen: item.maximum_amount,
      condition: {
        ...(condition.data.property_conditions
          ? { propertyConditions: condition.data.property_conditions }
          : {}),
        ...(condition.data.decoration_tiers
          ? { decorationTiers: condition.data.decoration_tiers }
          : {}),
        ...(condition.data.decoration_scopes
          ? { decorationScopes: condition.data.decoration_scopes }
          : {}),
      },
    };
  }
  conditionFail();
}

function toFactorPayload(raw: unknown) {
  const parsed = FactorPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    fail("DOUYIN_BUDGET_COEFFICIENT_INVALID", "报价系数配置无效");
  }
  return {
    layoutCoefficientsBps: parsed.data.layout_coefficients_bps,
    styleCoefficientsBps: parsed.data.style_coefficients_bps,
  };
}

function formatCoefficient(value: number): string {
  return (value / 10_000).toFixed(2);
}

function normalizedDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    fail("DOUYIN_BUDGET_RULE_INVALID", "报价生效时间无效");
  }
  return new Date(timestamp).toISOString();
}

function conditionFail(): never {
  fail("DOUYIN_BUDGET_RULE_CONDITION_INVALID", "报价条件配置无效");
}

function fail(
  code: ConstructorParameters<typeof DouyinBudgetCalculationError>[0],
  message: string,
): never {
  throw new DouyinBudgetCalculationError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalArray<const Values extends readonly [string, ...string[]]>(
  values: Values,
) {
  return z.array(z.enum(values)).min(1).refine(
    (items) => items.every((item, index) =>
      index === 0 || values.indexOf(item) > values.indexOf(items[index - 1] ?? item)
    ),
    "条件值必须按固定顺序且不能重复",
  );
}
