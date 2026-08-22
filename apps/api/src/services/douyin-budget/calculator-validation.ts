import {
  DOUYIN_BUDGET_CATEGORY_CODE_VALUES,
  DOUYIN_BUDGET_LAYOUT_CODE_VALUES,
  DOUYIN_BUDGET_OPTION_CODE_VALUES,
  DOUYIN_BUDGET_STYLE_CODE_VALUES,
  DOUYIN_DECORATION_SCOPE_VALUES,
  DOUYIN_DECORATION_TIER_VALUES,
  DOUYIN_PROPERTY_CONDITION_VALUES,
} from '@gooes/domain';

import {
  decimalNumberToFraction,
  type DecimalFraction,
} from './calculator-money';
import type {
  DouyinBudgetBasePricingItem,
  DouyinBudgetCalculationErrorCode,
  DouyinBudgetCalculationResult,
  DouyinBudgetCalculatorInput,
  DouyinBudgetPricingItem,
  DouyinBudgetPricingRules,
  DouyinBudgetRuleCondition,
} from './calculator';

const MAX_PRICING_ITEMS = 100;
const MAX_SELECTED_OPTIONS = 20;
export const MAX_DOUYIN_BUDGET_COEFFICIENT_BPS = 100_000;

const CATEGORY_CODES = new Set<string>(DOUYIN_BUDGET_CATEGORY_CODE_VALUES);
const CATEGORY_INDEX = new Map<string, number>(
  DOUYIN_BUDGET_CATEGORY_CODE_VALUES.map((code, index) => [code, index]),
);
const OPTION_CODES = new Set<string>(DOUYIN_BUDGET_OPTION_CODE_VALUES);
const LAYOUT_CODES = new Set<string>(DOUYIN_BUDGET_LAYOUT_CODE_VALUES);
const STYLE_CODES = new Set<string>(DOUYIN_BUDGET_STYLE_CODE_VALUES);
const PROPERTY_CONDITIONS = new Set<string>(DOUYIN_PROPERTY_CONDITION_VALUES);
const DECORATION_TIERS = new Set<string>(DOUYIN_DECORATION_TIER_VALUES);
const DECORATION_SCOPES = new Set<string>(DOUYIN_DECORATION_SCOPE_VALUES);

export type DouyinBudgetFail = (
  code: DouyinBudgetCalculationErrorCode,
  message: string,
) => never;

export function validateInput(
  input: DouyinBudgetCalculatorInput,
  fail: DouyinBudgetFail,
): DecimalFraction {
  if (
    !Number.isFinite(input.area) ||
    input.area < 10 ||
    input.area > 1_000 ||
    !PROPERTY_CONDITIONS.has(input.property_condition) ||
    !DECORATION_TIERS.has(input.decoration_tier) ||
    !DECORATION_SCOPES.has(input.decoration_scope) ||
    (input.layout_code !== undefined && !LAYOUT_CODES.has(input.layout_code)) ||
    (input.style_code !== undefined && !STYLE_CODES.has(input.style_code)) ||
    !Array.isArray(input.option_codes) ||
    input.option_codes.length > MAX_SELECTED_OPTIONS
  ) {
    fail('DOUYIN_BUDGET_INPUT_INVALID', '预算计算输入无效');
  }
  const area = decimalNumberToFraction(input.area);
  if (!area) fail('DOUYIN_BUDGET_INPUT_INVALID', '面积格式无效');
  return area;
}

export function validateRules(
  rules: DouyinBudgetPricingRules,
  fail: DouyinBudgetFail,
): void {
  if (
    typeof rules.versionId !== 'string' ||
    rules.versionId.trim() === '' ||
    !Number.isSafeInteger(rules.versionNo) ||
    rules.versionNo < 1 ||
    typeof rules.disclaimer !== 'string' ||
    rules.disclaimer.trim() === '' ||
    !isRecord(rules.factorPayload) ||
    !hasValidCoefficientMap(
      rules.factorPayload.layoutCoefficientsBps,
      DOUYIN_BUDGET_LAYOUT_CODE_VALUES,
    ) ||
    !hasValidCoefficientMap(
      rules.factorPayload.styleCoefficientsBps,
      DOUYIN_BUDGET_STYLE_CODE_VALUES,
    ) ||
    !Array.isArray(rules.items) ||
    rules.items.length === 0 ||
    rules.items.length > MAX_PRICING_ITEMS
  ) {
    fail('DOUYIN_BUDGET_RULE_INVALID', '报价规则无效');
  }
  const codes = new Set<string>();
  const labels = new Set<string>();
  for (const item of rules.items) {
    validatePricingItem(item, fail);
    if (codes.has(item.code)) {
      fail('DOUYIN_BUDGET_RULE_CODE_DUPLICATE', '报价规则编码不能重复');
    }
    const visibleLabel = item.label.trim();
    if (labels.has(visibleLabel)) {
      fail('DOUYIN_BUDGET_RULE_INVALID', '报价项目展示名称不能重复');
    }
    codes.add(item.code);
    labels.add(visibleLabel);
  }
}

export function validateSelectedOptions(
  optionCodes: readonly string[],
  fail: DouyinBudgetFail,
): string[] {
  if (new Set(optionCodes).size !== optionCodes.length) {
    fail('DOUYIN_BUDGET_OPTION_DUPLICATE', '选配项目不能重复');
  }
  if (optionCodes.some((code) => !OPTION_CODES.has(code))) {
    fail('DOUYIN_BUDGET_OPTION_UNKNOWN', '选配项目不存在');
  }
  return [...optionCodes];
}

export function matchesCondition(
  condition: DouyinBudgetRuleCondition,
  input: DouyinBudgetCalculatorInput,
): boolean {
  return (
    (!condition.propertyConditions ||
      condition.propertyConditions.includes(input.property_condition)) &&
    (!condition.decorationTiers ||
      condition.decorationTiers.includes(input.decoration_tier)) &&
    (!condition.decorationScopes ||
      condition.decorationScopes.includes(input.decoration_scope))
  );
}

export function validateRawCalculationResult(
  result: DouyinBudgetCalculationResult,
  fail: DouyinBudgetFail,
): void {
  if (
    !isSafeFen(result.minimum_total_fen) ||
    !isSafeFen(result.maximum_total_fen) ||
    result.minimum_total_fen > result.maximum_total_fen
  ) {
    fail('DOUYIN_BUDGET_RULE_AMOUNT_INVALID', '预算总额分值无效');
  }
  if (!Array.isArray(result.categories) || result.categories.length === 0) {
    fail('DOUYIN_BUDGET_RULE_INVALID', '预算分类无效');
  }
  let previousCategoryIndex = -1;
  let minimumSum = BigInt(0);
  let maximumSum = BigInt(0);
  for (const candidate of result.categories as readonly unknown[]) {
    if (!isRecord(candidate)) {
      fail('DOUYIN_BUDGET_RULE_INVALID', '预算分类无效');
    }
    const categoryCode = candidate.category_code;
    const categoryIndex = typeof categoryCode === 'string'
      ? (CATEGORY_INDEX.get(categoryCode) ?? -1)
      : -1;
    if (categoryIndex < 0 || categoryIndex <= previousCategoryIndex) {
      fail('DOUYIN_BUDGET_RULE_INVALID', '预算分类编码或顺序无效');
    }
    const minimum = candidate.minimum_amount_fen;
    const maximum = candidate.maximum_amount_fen;
    if (!isSafeFen(minimum) || !isSafeFen(maximum) || minimum > maximum) {
      fail('DOUYIN_BUDGET_RULE_AMOUNT_INVALID', '预算分类分值无效');
    }
    previousCategoryIndex = categoryIndex;
    minimumSum += BigInt(minimum);
    maximumSum += BigInt(maximum);
  }
  if (
    minimumSum !== BigInt(result.minimum_total_fen) ||
    maximumSum !== BigInt(result.maximum_total_fen)
  ) {
    fail('DOUYIN_BUDGET_RULE_AMOUNT_INVALID', '预算总额与分类合计不一致');
  }
}

function validatePricingItem(
  item: DouyinBudgetPricingItem,
  fail: DouyinBudgetFail,
): void {
  if (
    !isRecord(item) ||
    typeof item.code !== 'string' ||
    item.code.trim() === '' ||
    typeof item.label !== 'string' ||
    item.label.trim() === '' ||
    !CATEGORY_CODES.has(item.category) ||
    !isRecord(item.condition)
  ) {
    fail('DOUYIN_BUDGET_RULE_INVALID', '报价项目无效');
  }
  if (
    !isSafeFen(item.minimumAmountFen) ||
    !isSafeFen(item.maximumAmountFen) ||
    item.minimumAmountFen > item.maximumAmountFen
  ) {
    fail('DOUYIN_BUDGET_RULE_AMOUNT_INVALID', '报价金额必须是有效的整数分');
  }
  if (
    (item.role === 'base' &&
      (item.category !== 'base' || item.unit !== 'sqm')) ||
    (item.role === 'option' &&
      (!OPTION_CODES.has(item.code) ||
        (item.unit !== 'sqm' && item.unit !== 'fixed') ||
        'propertyConditionCoefficientBps' in item ||
        'decorationScopeCoefficientBps' in item)) ||
    (item.role !== 'base' && item.role !== 'option')
  ) {
    fail('DOUYIN_BUDGET_RULE_INVALID', '报价项目类型无效');
  }
  if (item.role === 'base') validateBaseCoefficients(item, fail);
  validateCondition(item.condition, fail);
  if (item.role === 'base') validateBaseIdentity(item, fail);
}

function validateBaseCoefficients(
  item: DouyinBudgetBasePricingItem,
  fail: DouyinBudgetFail,
): void {
  if (!isValidCoefficient(item.propertyConditionCoefficientBps)) {
    fail('DOUYIN_BUDGET_COEFFICIENT_INVALID', '报价系数配置无效');
  }
  const map = item.decorationScopeCoefficientBps;
  if (!isRecord(map) || !hasExactlyKeys(map, DOUYIN_DECORATION_SCOPE_VALUES)) {
    fail('DOUYIN_BUDGET_COEFFICIENT_INVALID', '报价系数配置无效');
  }
  for (const scope of DOUYIN_DECORATION_SCOPE_VALUES) {
    if (!isValidCoefficient(map[scope])) {
      fail('DOUYIN_BUDGET_COEFFICIENT_INVALID', '报价系数配置无效');
    }
  }
}

function validateBaseIdentity(
  item: DouyinBudgetBasePricingItem,
  fail: DouyinBudgetFail,
): void {
  const propertyConditions = item.condition.propertyConditions;
  const decorationTiers = item.condition.decorationTiers;
  const decorationScopes = item.condition.decorationScopes;
  if (
    propertyConditions?.length !== 1 ||
    decorationTiers?.length !== 1 ||
    (decorationScopes !== undefined &&
      !hasExactlyValues(decorationScopes, DOUYIN_DECORATION_SCOPE_VALUES))
  ) {
    fail('DOUYIN_BUDGET_RULE_CONDITION_INVALID', '基础报价条件无效');
  }
  const [prefix, tier, propertyCondition, extra] = item.code.split('.');
  if (
    prefix !== 'base' ||
    extra !== undefined ||
    !DECORATION_TIERS.has(tier ?? '') ||
    !PROPERTY_CONDITIONS.has(propertyCondition ?? '')
  ) {
    fail('DOUYIN_BUDGET_RULE_INVALID', '基础报价编码无效');
  }
  if (item.code !== `base.${decorationTiers[0]}.${propertyConditions[0]}`) {
    fail('DOUYIN_BUDGET_RULE_CONDITION_INVALID', '基础报价编码与条件不匹配');
  }
}

function validateCondition(
  condition: DouyinBudgetRuleCondition,
  fail: DouyinBudgetFail,
): void {
  if (
    !hasOnlyKeys(condition, [
      'propertyConditions',
      'decorationTiers',
      'decorationScopes',
    ]) ||
    !isOptionalKnownArray(condition.propertyConditions, PROPERTY_CONDITIONS) ||
    !isOptionalKnownArray(condition.decorationTiers, DECORATION_TIERS) ||
    !isOptionalKnownArray(condition.decorationScopes, DECORATION_SCOPES)
  ) {
    fail('DOUYIN_BUDGET_RULE_CONDITION_INVALID', '报价条件配置无效');
  }
}

function isValidCoefficient(value: unknown): value is number {
  return Number.isSafeInteger(value) &&
    (value as number) >= 1 &&
    (value as number) <= MAX_DOUYIN_BUDGET_COEFFICIENT_BPS;
}

function hasValidCoefficientMap(
  value: unknown,
  expectedKeys: readonly string[],
): boolean {
  if (!isRecord(value) || !hasExactlyKeys(value, expectedKeys)) return false;
  return expectedKeys.every((key) => isValidCoefficient(value[key]));
}

function isSafeFen(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactlyKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key));
}

function hasOnlyKeys(value: object, allowedKeys: readonly string[]): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isOptionalKnownArray(
  value: unknown,
  knownValues: ReadonlySet<string>,
): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length === 0) return false;
  return new Set(value).size === value.length &&
    value.every((item) => typeof item === 'string' && knownValues.has(item));
}

function hasExactlyValues(
  values: readonly string[],
  expectedValues: readonly string[],
): boolean {
  const actual = new Set(values);
  return actual.size === expectedValues.length &&
    expectedValues.every((value) => actual.has(value));
}
