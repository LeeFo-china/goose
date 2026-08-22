import {
  DOUYIN_BUDGET_CATEGORY_CODE_VALUES,
  DOUYIN_BUDGET_LAYOUT_CODE_VALUES,
  DOUYIN_BUDGET_OPTION_CODE_VALUES,
  DOUYIN_BUDGET_STYLE_CODE_VALUES,
  DOUYIN_DECORATION_SCOPE_VALUES,
  DOUYIN_DECORATION_TIER_VALUES,
  DOUYIN_PROPERTY_CONDITION_VALUES,
  type DouyinBudgetCategoryCode,
  type DouyinBudgetLayoutCode,
  type DouyinBudgetOptionCode,
  type DouyinBudgetStyleCode,
  type DouyinDecorationScope,
  type DouyinDecorationTier,
  type DouyinPropertyCondition,
} from "@gooes/domain";
import { z } from "zod";

export const BUDGET_PRICING_PAGE_SIZE = 20;
export const BUDGET_PRICING_MAX_ITEMS = 100;

export const BUDGET_ITEM_LABELS = {
  "base.economy.rough": "经济档毛坯基础施工",
  "base.economy.old_house": "经济档旧房翻新基础施工",
  "base.comfortable.rough": "舒适档毛坯基础施工",
  "base.comfortable.old_house": "舒适档旧房翻新基础施工",
  "base.quality.rough": "品质档毛坯基础施工",
  "base.quality.old_house": "品质档旧房翻新基础施工",
  demolition: "拆除",
  water_electricity_upgrade: "水电重点改造",
  custom_cabinet: "定制柜体",
} as const;

export const BUDGET_CATEGORY_LABELS: Record<DouyinBudgetCategoryCode, string> = {
  base: "基础施工",
  water_electricity: "水电",
  materials: "主材",
  custom: "定制",
  other: "其他",
};
export const BUDGET_LAYOUT_FACTOR_LABELS: Record<DouyinBudgetLayoutCode, string> = {
  one_bedroom_one_living: "一室一厅",
  two_bedroom_one_living: "两室一厅",
  two_bedroom_two_living: "两室两厅",
  three_bedroom_one_living: "三室一厅",
  three_bedroom_two_living: "三室两厅",
  four_bedroom_two_living: "四室两厅",
  villa_duplex: "别墅/复式",
  custom: "自定义户型",
};
export const BUDGET_STYLE_FACTOR_LABELS: Record<DouyinBudgetStyleCode, string> = {
  modern_simple: "现代简约",
  cream: "奶油风",
  new_chinese: "新中式",
  nordic: "北欧",
  light_luxury: "轻奢",
  natural_wood: "原木",
  american: "美式",
  french: "法式",
  wabi_sabi: "侘寂",
  custom: "自定义风格",
};

export const BASE_ITEM_CODES = [
  "base.economy.rough",
  "base.economy.old_house",
  "base.comfortable.rough",
  "base.comfortable.old_house",
  "base.quality.rough",
  "base.quality.old_house",
] as const;
export const BUDGET_ITEM_CODES = [
  ...BASE_ITEM_CODES,
  ...DOUYIN_BUDGET_OPTION_CODE_VALUES,
] as const;

export type BaseItemCode = typeof BASE_ITEM_CODES[number];
export type BudgetItemCode = typeof BUDGET_ITEM_CODES[number];
export type BudgetPricingStatus = "draft" | "active" | "archived";
export type BudgetPricingItemStatus = "active" | "inactive";

export interface BudgetPricingBaseItem {
  role: "base";
  category_code: "base";
  item_code: BaseItemCode;
  label: string;
  unit: "sqm";
  minimum_amount_fen: number;
  maximum_amount_fen: number;
  property_condition: DouyinPropertyCondition;
  decoration_tier: DouyinDecorationTier;
  property_condition_coefficient_bps: number;
  whole_house_coefficient_bps: number;
  partial_coefficient_bps: number;
  sort_order: number;
  status: BudgetPricingItemStatus;
}

export interface BudgetPricingOptionItem {
  role: "option";
  category_code: DouyinBudgetCategoryCode;
  item_code: DouyinBudgetOptionCode;
  label: string;
  unit: "sqm" | "fixed";
  minimum_amount_fen: number;
  maximum_amount_fen: number;
  property_conditions: DouyinPropertyCondition[];
  decoration_tiers: DouyinDecorationTier[];
  decoration_scopes: DouyinDecorationScope[];
  sort_order: number;
  status: BudgetPricingItemStatus;
}

export type BudgetPricingItem = BudgetPricingBaseItem | BudgetPricingOptionItem;

export interface BudgetPricingVersion {
  id: string;
  tenant_id: string;
  version_no: number;
  status: BudgetPricingStatus;
  effective_from: string;
  effective_to: string | null;
  currency: "CNY";
  disclaimer: string;
  created_by_employee_id: string;
  created_at: string;
  updated_at: string;
  factor_payload: BudgetPricingFactorPayload;
  items: BudgetPricingItem[];
}

export interface BudgetPricingFactorPayload {
  layout_coefficients_bps: Record<DouyinBudgetLayoutCode, number>;
  style_coefficients_bps: Record<DouyinBudgetStyleCode, number>;
}

export interface BudgetPricingPage {
  active_version: BudgetPricingVersion | null;
  list: BudgetPricingVersion[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface BudgetPricingEditorItem {
  item_code: BudgetItemCode;
  category_code: DouyinBudgetCategoryCode;
  label: string;
  unit: "sqm" | "fixed";
  minimum_amount_yuan: string;
  maximum_amount_yuan: string;
  property_condition?: DouyinPropertyCondition;
  decoration_tier?: DouyinDecorationTier;
  property_condition_coefficient_bps?: number;
  whole_house_coefficient_bps?: number;
  partial_coefficient_bps?: number;
  property_conditions?: DouyinPropertyCondition[];
  decoration_tiers?: DouyinDecorationTier[];
  decoration_scopes?: DouyinDecorationScope[];
  sort_order: number;
  status: BudgetPricingItemStatus;
}

export interface BudgetPricingDraftInput {
  effective_from: string;
  effective_to: string;
  disclaimer: string;
}

const BaseItemSchema = z.strictObject({
  role: z.literal("base"),
  category_code: z.literal("base"),
  item_code: z.enum(BASE_ITEM_CODES),
  label: z.string().trim().min(1).max(40),
  unit: z.literal("sqm"),
  minimum_amount_fen: z.int().nonnegative().safe(),
  maximum_amount_fen: z.int().nonnegative().safe(),
  property_condition: z.enum(DOUYIN_PROPERTY_CONDITION_VALUES),
  decoration_tier: z.enum(DOUYIN_DECORATION_TIER_VALUES),
  property_condition_coefficient_bps: z.int().min(1).max(100_000),
  whole_house_coefficient_bps: z.int().min(1).max(100_000),
  partial_coefficient_bps: z.int().min(1).max(100_000),
  sort_order: z.int().min(0).max(99),
  status: z.enum(["active", "inactive"]),
}).superRefine((item, context) => {
  if (item.item_code !== `base.${item.decoration_tier}.${item.property_condition}`) {
    context.addIssue({ code: "custom", message: "基础报价编码与条件不一致" });
  }
  if (item.minimum_amount_fen > item.maximum_amount_fen) {
    context.addIssue({ code: "custom", message: "最低价不能高于最高价" });
  }
});
const OptionItemSchema = z.strictObject({
  role: z.literal("option"),
  category_code: z.enum(DOUYIN_BUDGET_CATEGORY_CODE_VALUES),
  item_code: z.enum(DOUYIN_BUDGET_OPTION_CODE_VALUES),
  label: z.string().trim().min(1).max(40),
  unit: z.enum(["sqm", "fixed"]),
  minimum_amount_fen: z.int().nonnegative().safe(),
  maximum_amount_fen: z.int().nonnegative().safe(),
  property_conditions: canonicalArray(DOUYIN_PROPERTY_CONDITION_VALUES),
  decoration_tiers: canonicalArray(DOUYIN_DECORATION_TIER_VALUES),
  decoration_scopes: canonicalArray(DOUYIN_DECORATION_SCOPE_VALUES),
  sort_order: z.int().min(0).max(99),
  status: z.enum(["active", "inactive"]),
}).refine((item) => item.minimum_amount_fen <= item.maximum_amount_fen);
const CoefficientBpsSchema = z.int().min(1).max(100_000);
const LayoutCoefficientSchema = z.strictObject(Object.fromEntries(
  DOUYIN_BUDGET_LAYOUT_CODE_VALUES.map((code) => [code, CoefficientBpsSchema]),
) as Record<DouyinBudgetLayoutCode, typeof CoefficientBpsSchema>);
const StyleCoefficientSchema = z.strictObject(Object.fromEntries(
  DOUYIN_BUDGET_STYLE_CODE_VALUES.map((code) => [code, CoefficientBpsSchema]),
) as Record<DouyinBudgetStyleCode, typeof CoefficientBpsSchema>);
const PricingFactorPayloadSchema = z.strictObject({
  layout_coefficients_bps: LayoutCoefficientSchema,
  style_coefficients_bps: StyleCoefficientSchema,
});
const PricingVersionSchema = z.strictObject({
  id: z.uuid(),
  tenant_id: z.uuid(),
  version_no: z.int().min(1),
  status: z.enum(["draft", "active", "archived"]),
  effective_from: z.iso.datetime({ offset: true }),
  effective_to: z.iso.datetime({ offset: true }).nullable(),
  currency: z.literal("CNY"),
  disclaimer: z.string().trim().min(1).max(500),
  created_by_employee_id: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  factor_payload: PricingFactorPayloadSchema,
  items: z.array(z.discriminatedUnion("role", [BaseItemSchema, OptionItemSchema]))
    .max(BUDGET_PRICING_MAX_ITEMS),
}).superRefine((version, context) => {
  const itemCodes = version.items.map((item) => item.item_code);
  const sortOrders = version.items.map((item) => item.sort_order);
  if (new Set(itemCodes).size !== itemCodes.length) {
    context.addIssue({ code: "custom", message: "报价项目编码不能重复", path: ["items"] });
  }
  if (new Set(sortOrders).size !== sortOrders.length) {
    context.addIssue({ code: "custom", message: "报价项目顺序不能重复", path: ["items"] });
  }
  if (
    version.effective_to !== null
    && Date.parse(version.effective_to) <= Date.parse(version.effective_from)
  ) {
    context.addIssue({ code: "custom", message: "报价失效时间必须晚于生效时间", path: ["effective_to"] });
  }
});
const PricingPageSchema = z.strictObject({
  active_version: PricingVersionSchema.nullable(),
  list: z.array(PricingVersionSchema),
  pagination: z.strictObject({
    page: z.int().min(1),
    pageSize: z.int().min(1).max(100),
    total: z.int().nonnegative(),
    totalPages: z.int().nonnegative(),
  }),
}).refine(
  (page) => page.active_version === null || page.active_version.status === "active",
  { message: "当前报价版本状态无效", path: ["active_version"] },
);

export function normalizePricingVersion(value: unknown): BudgetPricingVersion | null {
  const parsed = PricingVersionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function normalizePricingVersionPage(
  value: unknown,
  expected: { page: number; pageSize: number },
): BudgetPricingPage | null {
  const parsed = PricingPageSchema.safeParse(value);
  if (!parsed.success) return null;
  if (
    parsed.data.pagination.page !== expected.page
    || parsed.data.pagination.pageSize !== expected.pageSize
  ) return null;
  return parsed.data;
}

export function isBaseItemCode(value: BudgetItemCode): value is BaseItemCode {
  return value.startsWith("base.");
}

function canonicalArray<const Values extends readonly [string, ...string[]]>(
  values: Values,
) {
  return z.array(z.enum(values)).refine((items) => items.every(
    (item, index) => index === 0 || values.indexOf(item) > values.indexOf(items[index - 1] ?? item),
  ));
}
