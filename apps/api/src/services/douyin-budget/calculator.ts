import {
  DOUYIN_BUDGET_CATEGORY_CODE_VALUES,
  type DouyinBudgetCategoryCode,
  type DouyinBudgetOptionCode,
  type DouyinDecorationScope,
  type DouyinDecorationTier,
  type DouyinPropertyCondition,
} from '@gooes/domain';

import {
  addFenRangeToMap,
  calculateFenRange,
  fenToIntegerYuan,
  safeBigIntToNumber,
  type FenRange,
} from './calculator-money';
import {
  matchesCondition,
  MAX_DOUYIN_BUDGET_COEFFICIENT_BPS,
  validateInput,
  validateRawCalculationResult,
  validateRules,
  validateSelectedOptions,
} from './calculator-validation';

export { MAX_DOUYIN_BUDGET_COEFFICIENT_BPS };

export interface DouyinBudgetRuleCondition {
  readonly propertyConditions?: readonly DouyinPropertyCondition[];
  readonly decorationTiers?: readonly DouyinDecorationTier[];
  readonly decorationScopes?: readonly DouyinDecorationScope[];
}

interface DouyinBudgetPricingItemBase {
  readonly code: string;
  readonly category: DouyinBudgetCategoryCode;
  readonly label: string;
  readonly minimumAmountFen: number;
  readonly maximumAmountFen: number;
  readonly condition: DouyinBudgetRuleCondition;
}

export interface DouyinBudgetBasePricingItem extends DouyinBudgetPricingItemBase {
  readonly role: 'base';
  readonly code: `base.${DouyinDecorationTier}.${DouyinPropertyCondition}`;
  readonly category: 'base';
  readonly unit: 'sqm';
  readonly propertyConditionCoefficientBps: number;
  readonly decorationScopeCoefficientBps: Readonly<
    Record<DouyinDecorationScope, number>
  >;
}

export interface DouyinBudgetOptionPricingItem extends DouyinBudgetPricingItemBase {
  readonly role: 'option';
  readonly code: DouyinBudgetOptionCode;
  readonly unit: 'sqm' | 'fixed';
}

export type DouyinBudgetPricingItem =
  | DouyinBudgetBasePricingItem
  | DouyinBudgetOptionPricingItem;

export interface DouyinBudgetPricingRules {
  readonly versionId: string;
  readonly versionNo: number;
  readonly disclaimer: string;
  readonly items: readonly DouyinBudgetPricingItem[];
}

export interface DouyinBudgetCalculatorInput {
  readonly area: number;
  readonly property_condition: DouyinPropertyCondition;
  readonly decoration_tier: DouyinDecorationTier;
  readonly decoration_scope: DouyinDecorationScope;
  readonly option_codes: readonly string[];
}

export type DouyinBudgetCalculationErrorCode =
  | 'DOUYIN_BUDGET_INPUT_INVALID'
  | 'DOUYIN_BUDGET_COEFFICIENT_INVALID'
  | 'DOUYIN_BUDGET_RULE_INVALID'
  | 'DOUYIN_BUDGET_RULE_AMOUNT_INVALID'
  | 'DOUYIN_BUDGET_RULE_CONDITION_INVALID'
  | 'DOUYIN_BUDGET_RULE_CODE_DUPLICATE'
  | 'DOUYIN_BUDGET_BASE_MISSING'
  | 'DOUYIN_BUDGET_BASE_AMBIGUOUS'
  | 'DOUYIN_BUDGET_OPTION_DUPLICATE'
  | 'DOUYIN_BUDGET_OPTION_UNKNOWN'
  | 'DOUYIN_BUDGET_OPTION_NOT_APPLICABLE'
  | 'DOUYIN_BUDGET_AMOUNT_OVERFLOW';

export class DouyinBudgetCalculationError extends Error {
  override readonly name = 'DouyinBudgetCalculationError';
  constructor(
    readonly code: DouyinBudgetCalculationErrorCode,
    message: string,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface DouyinBudgetCalculationResult {
  readonly minimum_total_fen: number;
  readonly maximum_total_fen: number;
  readonly categories: readonly {
    readonly category_code: DouyinBudgetCategoryCode;
    readonly minimum_amount_fen: number;
    readonly maximum_amount_fen: number;
  }[];
  readonly calculation_basis: {
    readonly area_sqm: number;
    readonly property_condition: DouyinPropertyCondition;
    readonly property_condition_coefficient_bps: number;
    readonly decoration_tier: DouyinDecorationTier;
    readonly decoration_scope: DouyinDecorationScope;
    readonly decoration_scope_coefficient_bps: number;
    readonly selected_option_codes: readonly string[];
  };
  readonly included_items: readonly string[];
  readonly excluded_items: readonly string[];
}

export interface DouyinBudgetPublicYuanProjection {
  readonly minimum_total: number;
  readonly maximum_total: number;
  readonly categories: readonly {
    readonly category_code: DouyinBudgetCategoryCode;
    readonly minimum_amount: number;
    readonly maximum_amount: number;
  }[];
  readonly calculation_basis: DouyinBudgetCalculationResult['calculation_basis'];
  readonly included_items: readonly string[];
  readonly excluded_items: readonly string[];
}

export function calculateDouyinBudget(
  rules: DouyinBudgetPricingRules,
  input: DouyinBudgetCalculatorInput,
): DouyinBudgetCalculationResult {
  const area = validateInput(input, fail);
  validateRules(rules, fail);

  const matchingBases = rules.items.filter(
    (item): item is DouyinBudgetBasePricingItem =>
      item.role === 'base' && matchesCondition(item.condition, input),
  );
  if (matchingBases.length === 0) {
    fail('DOUYIN_BUDGET_BASE_MISSING', '缺少匹配的基础报价规则');
  }
  if (matchingBases.length > 1) {
    fail('DOUYIN_BUDGET_BASE_AMBIGUOUS', '匹配到多条基础报价规则');
  }
  const matchingBase = matchingBases[0];
  if (!matchingBase) {
    fail('DOUYIN_BUDGET_BASE_MISSING', '缺少匹配的基础报价规则');
  }

  const optionByCode = new Map(
    rules.items
      .filter((item): item is DouyinBudgetOptionPricingItem =>
        item.role === 'option')
      .map((item) => [item.code, item]),
  );
  const selectedCodes = validateSelectedOptions(input.option_codes, fail);
  const options = selectedCodes.map((code) => {
    const option = optionByCode.get(code as DouyinBudgetOptionCode);
    if (!option) {
      fail('DOUYIN_BUDGET_OPTION_UNKNOWN', '选配项目不存在');
    }
    if (!matchesCondition(option.condition, input)) {
      fail('DOUYIN_BUDGET_OPTION_NOT_APPLICABLE', '选配项目不适用于当前条件');
    }
    return option;
  });

  const propertyCoefficient = matchingBase.propertyConditionCoefficientBps;
  const scopeCoefficient =
    matchingBase.decorationScopeCoefficientBps[input.decoration_scope];
  if (scopeCoefficient === undefined) {
    fail('DOUYIN_BUDGET_COEFFICIENT_INVALID', '报价系数配置无效');
  }
  const baseRange = calculateFenRange({
    ...matchingBase,
    area,
    coefficientBps: [propertyCoefficient, scopeCoefficient],
  });
  const categoryRanges = new Map<DouyinBudgetCategoryCode, FenRange>();
  addFenRangeToMap(categoryRanges, matchingBase.category, baseRange);
  for (const option of options) {
    addFenRangeToMap(categoryRanges, option.category, calculateFenRange({
      ...option,
      area,
    }));
  }

  const categories = DOUYIN_BUDGET_CATEGORY_CODE_VALUES.flatMap(
    (categoryCode) => {
      const range = categoryRanges.get(categoryCode);
      return range
        ? [{
          category_code: categoryCode,
          minimum_amount_fen: toSafeFen(range.minimum),
          maximum_amount_fen: toSafeFen(range.maximum),
        }]
        : [];
    },
  );
  const total = [...categoryRanges.values()].reduce<FenRange>(
    (sum, range) => ({
      minimum: sum.minimum + range.minimum,
      maximum: sum.maximum + range.maximum,
    }),
    { minimum: BigInt(0), maximum: BigInt(0) },
  );
  const selectedCodeSet = new Set(selectedCodes);

  return {
    minimum_total_fen: toSafeFen(total.minimum),
    maximum_total_fen: toSafeFen(total.maximum),
    categories,
    calculation_basis: {
      area_sqm: input.area,
      property_condition: input.property_condition,
      property_condition_coefficient_bps: propertyCoefficient,
      decoration_tier: input.decoration_tier,
      decoration_scope: input.decoration_scope,
      decoration_scope_coefficient_bps: scopeCoefficient,
      selected_option_codes: [...selectedCodes],
    },
    included_items: [matchingBase, ...options].map((item) => item.label),
    excluded_items: rules.items
      .filter(
        (item): item is DouyinBudgetOptionPricingItem =>
          item.role === 'option' &&
          !selectedCodeSet.has(item.code) &&
          matchesCondition(item.condition, input),
      )
      .map((item) => item.label),
  };
}

export function projectDouyinBudgetToPublicYuan(
  result: DouyinBudgetCalculationResult,
): DouyinBudgetPublicYuanProjection {
  validateRawCalculationResult(result, fail);
  const categories = result.categories.map((category) => {
    const minimumAmount = fenToSafeIntegerYuan(category.minimum_amount_fen);
    const maximumAmount = fenToSafeIntegerYuan(category.maximum_amount_fen);
    return {
      category_code: category.category_code,
      minimum_amount: minimumAmount,
      maximum_amount: maximumAmount,
    };
  });
  return {
    minimum_total: categories.reduce(
      (sum, category) => sum + category.minimum_amount,
      0,
    ),
    maximum_total: categories.reduce(
      (sum, category) => sum + category.maximum_amount,
      0,
    ),
    categories,
    calculation_basis: {
      ...result.calculation_basis,
      selected_option_codes: [
        ...result.calculation_basis.selected_option_codes,
      ],
    },
    included_items: [...result.included_items],
    excluded_items: [...result.excluded_items],
  };
}

function toSafeFen(value: bigint): number {
  const safeValue = safeBigIntToNumber(value);
  if (safeValue === null) {
    fail('DOUYIN_BUDGET_AMOUNT_OVERFLOW', '预算金额超出安全整数范围');
  }
  return safeValue;
}

function fenToSafeIntegerYuan(value: unknown): number {
  const conversion = fenToIntegerYuan(value);
  if (!conversion.ok) {
    fail('DOUYIN_BUDGET_RULE_AMOUNT_INVALID', '预算金额分值无效');
  }
  return conversion.value;
}

function fail(
  code: DouyinBudgetCalculationErrorCode,
  message: string,
): never {
  throw new DouyinBudgetCalculationError(code, message);
}
