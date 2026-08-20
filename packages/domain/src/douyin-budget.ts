import { z } from 'zod';

export const DOUYIN_PROPERTY_CONDITION_VALUES = [
  'rough',
  'old_house',
] as const;

export const DOUYIN_DECORATION_TIER_VALUES = [
  'economy',
  'comfortable',
  'quality',
] as const;

export const DOUYIN_DECORATION_SCOPE_VALUES = [
  'whole_house',
  'partial',
] as const;

export const DOUYIN_BUDGET_OPTION_CODE_VALUES = [
  'demolition',
  'water_electricity_upgrade',
  'custom_cabinet',
] as const;

export const DOUYIN_BUDGET_CATEGORY_CODE_VALUES = [
  'base',
  'water_electricity',
  'materials',
  'custom',
  'other',
] as const;

export const DOUYIN_BUDGET_AI_STATUS_VALUES = [
  'pending',
  'succeeded',
  'failed',
  'skipped',
] as const;

// Public estimate results use integer yuan. Pricing persistence and calculator
// internals keep integer fen and round once when producing this public result.
const MoneyYuanSchema = z.int().nonnegative();
const ResultItemTextSchema = z.string().trim().min(1).max(300);
const AiListItemSchema = z.string().trim().min(1).max(300);
const OptionCodeSchema = z
  .string()
  .trim()
  .pipe(z.enum(DOUYIN_BUDGET_OPTION_CODE_VALUES));

export const DouyinBudgetEstimateRequestSchema = z.strictObject({
  area: z.number().min(10).max(1_000),
  property_condition: z.enum(DOUYIN_PROPERTY_CONDITION_VALUES),
  decoration_tier: z.enum(DOUYIN_DECORATION_TIER_VALUES),
  decoration_scope: z.enum(DOUYIN_DECORATION_SCOPE_VALUES),
  layout: z.string().trim().min(1).max(40).optional(),
  style: z.string().trim().min(1).max(40).optional(),
  option_codes: z
    .array(OptionCodeSchema)
    .max(20)
    .refine(
      (optionCodes) => new Set(optionCodes).size === optionCodes.length,
      '选配项不能重复',
    ),
  demand: z.string().trim().max(1_000).optional(),
});

export const DouyinBudgetEstimateCategorySchema = z
  .strictObject({
    category_code: z.enum(DOUYIN_BUDGET_CATEGORY_CODE_VALUES),
    label: z.string().trim().min(1).max(40),
    minimum_amount: MoneyYuanSchema,
    maximum_amount: MoneyYuanSchema,
  })
  .refine(
    (category) => category.minimum_amount <= category.maximum_amount,
    {
      message: '分类预算下限不能大于上限',
      path: ['maximum_amount'],
    },
  );

export const DouyinBudgetEstimateResultSchema = z
  .strictObject({
    id: z.uuid(),
    estimate_no: z.string().regex(/^DYYS-\d{8}-\d{6}$/),
    minimum_total: MoneyYuanSchema,
    maximum_total: MoneyYuanSchema,
    categories: z
      .array(DouyinBudgetEstimateCategorySchema)
      .max(DOUYIN_BUDGET_CATEGORY_CODE_VALUES.length)
      .refine(
        (categories) =>
          new Set(categories.map((category) => category.category_code)).size ===
          categories.length,
        '预算分类不能重复',
      ),
    calculation_basis: z.array(ResultItemTextSchema).max(20),
    included_items: z.array(ResultItemTextSchema).max(50),
    excluded_items: z.array(ResultItemTextSchema).max(50),
    pricing_version: z.string().trim().min(1).max(40),
    disclaimer: z.string().trim().min(1).max(500),
    ai_status: z.enum(DOUYIN_BUDGET_AI_STATUS_VALUES),
  })
  .refine((result) => result.minimum_total <= result.maximum_total, {
    message: '总预算下限不能大于上限',
    path: ['maximum_total'],
  });

export const DouyinBudgetAiAnalysisSchema = z.strictObject({
  summary: z.string().trim().min(1).max(1_000),
  allocation_advice: z.array(AiListItemSchema).max(10),
  risk_factors: z.array(AiListItemSchema).max(10),
  onsite_questions: z.array(AiListItemSchema).max(10),
});

export type DouyinPropertyCondition =
  (typeof DOUYIN_PROPERTY_CONDITION_VALUES)[number];
export type DouyinDecorationTier =
  (typeof DOUYIN_DECORATION_TIER_VALUES)[number];
export type DouyinDecorationScope =
  (typeof DOUYIN_DECORATION_SCOPE_VALUES)[number];
export type DouyinBudgetOptionCode =
  (typeof DOUYIN_BUDGET_OPTION_CODE_VALUES)[number];
export type DouyinBudgetCategoryCode =
  (typeof DOUYIN_BUDGET_CATEGORY_CODE_VALUES)[number];
export type DouyinBudgetAiStatus =
  (typeof DOUYIN_BUDGET_AI_STATUS_VALUES)[number];
export type DouyinBudgetEstimateRequest = z.infer<
  typeof DouyinBudgetEstimateRequestSchema
>;
export type DouyinBudgetEstimateCategory = z.infer<
  typeof DouyinBudgetEstimateCategorySchema
>;
export type DouyinBudgetEstimateResult = z.infer<
  typeof DouyinBudgetEstimateResultSchema
>;
export type DouyinBudgetAiAnalysis = z.infer<
  typeof DouyinBudgetAiAnalysisSchema
>;
