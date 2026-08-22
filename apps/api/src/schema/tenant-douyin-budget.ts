import {
  DOUYIN_BUDGET_CATEGORY_CODE_VALUES,
  DOUYIN_BUDGET_LAYOUT_CODE_VALUES,
  DOUYIN_BUDGET_OPTION_CODE_VALUES,
  DOUYIN_BUDGET_STYLE_CODE_VALUES,
  DOUYIN_DECORATION_SCOPE_VALUES,
  DOUYIN_DECORATION_TIER_VALUES,
  DOUYIN_PROPERTY_CONDITION_VALUES,
} from "@gooes/domain";
import { z } from "zod";

const DateTimeSchema = z.iso.datetime({ offset: true });
const PricingStatusSchema = z.enum(["draft", "active", "archived"]);
const ItemStatusSchema = z.enum(["active", "inactive"]);
const UnitSchema = z.enum(["sqm", "fixed"]);
const MoneyFenSchema = z.int().min(0).max(Number.MAX_SAFE_INTEGER);
const CoefficientBpsSchema = z.int().min(1).max(100_000);
const ItemCommonShape = {
  label: z.string().trim().min(1).max(40),
  minimum_amount_fen: MoneyFenSchema,
  maximum_amount_fen: MoneyFenSchema,
  sort_order: z.int().min(0).max(99),
  status: ItemStatusSchema,
};

function canonicalArray<const Values extends readonly [string, ...string[]]>(
  values: Values,
) {
  const order = new Map(values.map((value, index) => [value, index]));
  return z.array(z.enum(values)).max(values.length).refine(
    (items) => items.every((item, index) =>
      index === 0 || (order.get(items[index - 1] ?? "") ?? -1)
        < (order.get(item) ?? -1)),
    "条件必须按固定顺序且不能重复",
  );
}

const BasePricingItemSchema = z.strictObject({
  role: z.literal("base"),
  category_code: z.literal("base"),
  item_code: z.string().regex(
    /^base\.(economy|comfortable|quality)\.(rough|old_house)$/,
    "基础报价编码无效",
  ),
  unit: z.literal("sqm"),
  property_condition: z.enum(DOUYIN_PROPERTY_CONDITION_VALUES),
  decoration_tier: z.enum(DOUYIN_DECORATION_TIER_VALUES),
  property_condition_coefficient_bps: CoefficientBpsSchema,
  whole_house_coefficient_bps: CoefficientBpsSchema,
  partial_coefficient_bps: CoefficientBpsSchema,
  ...ItemCommonShape,
}).superRefine((item, context) => {
  if (item.item_code !==
    `base.${item.decoration_tier}.${item.property_condition}`) {
    context.addIssue({
      code: "custom",
      path: ["item_code"],
      message: "基础报价编码与适用条件不一致",
    });
  }
  if (item.minimum_amount_fen > item.maximum_amount_fen) {
    context.addIssue({
      code: "custom",
      path: ["maximum_amount_fen"],
      message: "报价上限不能小于下限",
    });
  }
});

const OptionPricingItemSchema = z.strictObject({
  role: z.literal("option"),
  category_code: z.enum(DOUYIN_BUDGET_CATEGORY_CODE_VALUES),
  item_code: z.enum(DOUYIN_BUDGET_OPTION_CODE_VALUES),
  unit: UnitSchema,
  property_conditions: canonicalArray(DOUYIN_PROPERTY_CONDITION_VALUES),
  decoration_tiers: canonicalArray(DOUYIN_DECORATION_TIER_VALUES),
  decoration_scopes: canonicalArray(DOUYIN_DECORATION_SCOPE_VALUES),
  ...ItemCommonShape,
}).superRefine((item, context) => {
  if (item.minimum_amount_fen > item.maximum_amount_fen) {
    context.addIssue({
      code: "custom",
      path: ["maximum_amount_fen"],
      message: "报价上限不能小于下限",
    });
  }
});

const LayoutCoefficientSchema = z.strictObject(Object.fromEntries(
  DOUYIN_BUDGET_LAYOUT_CODE_VALUES.map((code) => [code, CoefficientBpsSchema]),
) as Record<(typeof DOUYIN_BUDGET_LAYOUT_CODE_VALUES)[number], typeof CoefficientBpsSchema>);
const StyleCoefficientSchema = z.strictObject(Object.fromEntries(
  DOUYIN_BUDGET_STYLE_CODE_VALUES.map((code) => [code, CoefficientBpsSchema]),
) as Record<(typeof DOUYIN_BUDGET_STYLE_CODE_VALUES)[number], typeof CoefficientBpsSchema>);
export const TenantDouyinBudgetFactorPayloadSchema = z.strictObject({
  layout_coefficients_bps: LayoutCoefficientSchema,
  style_coefficients_bps: StyleCoefficientSchema,
});

export const TenantDouyinBudgetPricingItemSchema = z.discriminatedUnion(
  "role",
  [BasePricingItemSchema, OptionPricingItemSchema],
);

export const TenantDouyinBudgetListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const TenantDouyinBudgetVersionParamsSchema = z.strictObject({
  id: z.uuid("无效的报价版本 ID"),
});

export const TenantDouyinBudgetCreateDraftSchema = z.strictObject({
  effective_from: DateTimeSchema,
  effective_to: DateTimeSchema.nullable().default(null),
  disclaimer: z.string().trim().min(1).max(500),
}).refine(
  (input) => input.effective_to === null ||
    Date.parse(input.effective_to) > Date.parse(input.effective_from),
  { path: ["effective_to"], message: "报价失效时间必须晚于生效时间" },
);

export const TenantDouyinBudgetReplaceItemsSchema = z.strictObject({
  expected_updated_at: DateTimeSchema,
  items: z.array(TenantDouyinBudgetPricingItemSchema).min(1).max(100),
}).superRefine((input, context) => {
  for (const key of ["item_code", "sort_order", "label"] as const) {
    const values = input.items.map((item) => item[key]);
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: key === "item_code"
          ? "报价项目编码不能重复"
          : key === "sort_order"
          ? "报价项目排序不能重复"
          : "报价项目名称不能重复",
      });
    }
  }
});

export const TenantDouyinBudgetOptimisticActionSchema = z.strictObject({
  expected_updated_at: DateTimeSchema,
});

export const TenantDouyinBudgetUpdateFactorsSchema = z.strictObject({
  expected_updated_at: DateTimeSchema,
  factor_payload: TenantDouyinBudgetFactorPayloadSchema,
});

export type TenantDouyinBudgetPricingItem = z.infer<
  typeof TenantDouyinBudgetPricingItemSchema
>;
export type TenantDouyinBudgetListQuery = z.infer<
  typeof TenantDouyinBudgetListQuerySchema
>;
export type TenantDouyinBudgetCreateDraft = z.infer<
  typeof TenantDouyinBudgetCreateDraftSchema
>;
export type TenantDouyinBudgetReplaceItems = z.infer<
  typeof TenantDouyinBudgetReplaceItemsSchema
>;
export type TenantDouyinBudgetOptimisticAction = z.infer<
  typeof TenantDouyinBudgetOptimisticActionSchema
>;
export type TenantDouyinBudgetFactorPayload = z.infer<
  typeof TenantDouyinBudgetFactorPayloadSchema
>;
export type TenantDouyinBudgetUpdateFactors = z.infer<
  typeof TenantDouyinBudgetUpdateFactorsSchema
>;
export type TenantDouyinBudgetPricingStatus = z.infer<
  typeof PricingStatusSchema
>;
