import {
  DOUYIN_BUDGET_CATEGORY_CODE_VALUES,
  DOUYIN_BUDGET_OPTION_CODE_VALUES,
  DOUYIN_DECORATION_SCOPE_VALUES,
  DOUYIN_DECORATION_TIER_VALUES,
  DOUYIN_PROPERTY_CONDITION_VALUES,
  type DouyinBudgetCategoryCode,
  type DouyinBudgetOptionCode,
  type DouyinDecorationScope,
  type DouyinDecorationTier,
  type DouyinPropertyCondition,
} from '@gooes/domain';

const BIGINT_ZERO = BigInt(0);
const BIGINT_ONE = BigInt(1);
const BIGINT_TEN = BigInt(10);
const BASIS_POINTS_SCALE = BigInt(10_000);
const MAX_PRICING_ITEMS = 100;
const MAX_SELECTED_OPTIONS = 20;
export const MAX_DOUYIN_BUDGET_COEFFICIENT_BPS = 100_000;

const CATEGORY_CODES = new Set<string>(DOUYIN_BUDGET_CATEGORY_CODE_VALUES);
const OPTION_CODES = new Set<string>(DOUYIN_BUDGET_OPTION_CODE_VALUES);
const PROPERTY_CONDITIONS = new Set<string>(DOUYIN_PROPERTY_CONDITION_VALUES);
const DECORATION_TIERS = new Set<string>(DOUYIN_DECORATION_TIER_VALUES);
const DECORATION_SCOPES = new Set<string>(DOUYIN_DECORATION_SCOPE_VALUES);

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
  readonly category: 'base';
  readonly unit: 'sqm';
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
  readonly propertyConditionCoefficientBps: Readonly<Record<DouyinPropertyCondition, number>>;
  readonly decorationScopeCoefficientBps: Readonly<Record<DouyinDecorationScope, number>>;
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

type FenRange = { minimum: bigint; maximum: bigint };
type DecimalFraction = { numerator: bigint; denominator: bigint };
type RationalFenRange = FenRange & { denominator: bigint };

export function calculateDouyinBudget(
  rules: DouyinBudgetPricingRules,
  input: DouyinBudgetCalculatorInput,
): DouyinBudgetCalculationResult {
  const area = validateInput(input);
  validateRules(rules);

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
  const selectedCodes = validateSelectedOptions(input.option_codes);
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

  const propertyCoefficient =
    rules.propertyConditionCoefficientBps[input.property_condition];
  const scopeCoefficient =
    rules.decorationScopeCoefficientBps[input.decoration_scope];
  if (propertyCoefficient === undefined || scopeCoefficient === undefined) {
    fail('DOUYIN_BUDGET_COEFFICIENT_INVALID', '报价系数配置无效');
  }
  const baseRange = calculateBaseRange(
    matchingBase,
    area,
    propertyCoefficient,
    scopeCoefficient,
  );
  const categoryRanges = new Map<DouyinBudgetCategoryCode, FenRange>();
  addRange(categoryRanges, matchingBase.category, baseRange);
  for (const option of options) {
    addRange(categoryRanges, option.category, calculateOptionRange(option, area));
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
    { minimum: BIGINT_ZERO, maximum: BIGINT_ZERO },
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

function validateInput(input: DouyinBudgetCalculatorInput): DecimalFraction {
  if (
    !Number.isFinite(input.area) ||
    input.area < 10 ||
    input.area > 1_000 ||
    !PROPERTY_CONDITIONS.has(input.property_condition) ||
    !DECORATION_TIERS.has(input.decoration_tier) ||
    !DECORATION_SCOPES.has(input.decoration_scope) ||
    !Array.isArray(input.option_codes) ||
    input.option_codes.length > MAX_SELECTED_OPTIONS
  ) {
    fail('DOUYIN_BUDGET_INPUT_INVALID', '预算计算输入无效');
  }
  return decimalNumberToFraction(input.area);
}

function validateRules(rules: DouyinBudgetPricingRules): void {
  if (
    typeof rules.versionId !== 'string' ||
    rules.versionId.trim() === '' ||
    !Number.isSafeInteger(rules.versionNo) ||
    rules.versionNo < 1 ||
    typeof rules.disclaimer !== 'string' ||
    rules.disclaimer.trim() === '' ||
    !Array.isArray(rules.items) ||
    rules.items.length === 0 ||
    rules.items.length > MAX_PRICING_ITEMS
  ) {
    fail('DOUYIN_BUDGET_RULE_INVALID', '报价规则无效');
  }
  validateCoefficientMap(rules.propertyConditionCoefficientBps,
    DOUYIN_PROPERTY_CONDITION_VALUES);
  validateCoefficientMap(rules.decorationScopeCoefficientBps,
    DOUYIN_DECORATION_SCOPE_VALUES);

  const codes = new Set<string>();
  for (const item of rules.items) {
    validatePricingItem(item);
    if (codes.has(item.code)) {
      fail('DOUYIN_BUDGET_RULE_CODE_DUPLICATE', '报价规则编码不能重复');
    }
    codes.add(item.code);
  }
}

function validateCoefficientMap(
  map: Readonly<Record<string, number>>,
  expectedKeys: readonly string[],
): void {
  if (!isRecord(map) || !hasExactlyKeys(map, expectedKeys)) {
    fail('DOUYIN_BUDGET_COEFFICIENT_INVALID', '报价系数配置无效');
  }
  for (const key of expectedKeys) {
    const coefficient = map[key];
    if (
      coefficient === undefined ||
      !Number.isSafeInteger(coefficient) ||
      coefficient < 1 ||
      coefficient > MAX_DOUYIN_BUDGET_COEFFICIENT_BPS
    ) {
      fail('DOUYIN_BUDGET_COEFFICIENT_INVALID', '报价系数配置无效');
    }
  }
}

function validatePricingItem(item: DouyinBudgetPricingItem): void {
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
        (item.unit !== 'sqm' && item.unit !== 'fixed'))) ||
    (item.role !== 'base' && item.role !== 'option')
  ) {
    fail('DOUYIN_BUDGET_RULE_INVALID', '报价项目类型无效');
  }
  validateCondition(item.condition);
}

function validateCondition(condition: DouyinBudgetRuleCondition): void {
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

function validateSelectedOptions(optionCodes: readonly string[]): string[] {
  const unique = new Set(optionCodes);
  if (unique.size !== optionCodes.length) {
    fail('DOUYIN_BUDGET_OPTION_DUPLICATE', '选配项目不能重复');
  }
  if (optionCodes.some((code) => !OPTION_CODES.has(code))) {
    fail('DOUYIN_BUDGET_OPTION_UNKNOWN', '选配项目不存在');
  }
  return [...optionCodes];
}

function matchesCondition(
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

function calculateBaseRange(
  item: DouyinBudgetBasePricingItem,
  area: DecimalFraction,
  propertyCoefficientBps: number,
  scopeCoefficientBps: number,
): FenRange {
  const range = rationalRangeForItem(item, area);
  const coefficient =
    BigInt(propertyCoefficientBps) * BigInt(scopeCoefficientBps);
  const denominator =
    range.denominator * BASIS_POINTS_SCALE * BASIS_POINTS_SCALE;
  return {
    minimum: divideHalfUp(range.minimum * coefficient, denominator),
    maximum: divideHalfUp(range.maximum * coefficient, denominator),
  };
}

function calculateOptionRange(
  item: DouyinBudgetOptionPricingItem,
  area: DecimalFraction,
): FenRange {
  const range = rationalRangeForItem(item, area);
  return {
    minimum: divideHalfUp(range.minimum, range.denominator),
    maximum: divideHalfUp(range.maximum, range.denominator),
  };
}

function rationalRangeForItem(
  item: DouyinBudgetPricingItem,
  area: DecimalFraction,
): RationalFenRange {
  const multiplier = item.unit === 'sqm' ? area.numerator : BIGINT_ONE;
  const denominator = item.unit === 'sqm' ? area.denominator : BIGINT_ONE;
  return {
    minimum: BigInt(item.minimumAmountFen) * multiplier,
    maximum: BigInt(item.maximumAmountFen) * multiplier,
    denominator,
  };
}

function decimalNumberToFraction(value: number): DecimalFraction {
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(
    value.toString(),
  );
  if (!match?.[1]) {
    fail('DOUYIN_BUDGET_INPUT_INVALID', '面积格式无效');
  }
  const fractionalDigits = match[2] ?? '';
  const exponent = Number(match[3] ?? '0');
  const digits = BigInt(`${match[1]}${fractionalDigits}`);
  const scale = fractionalDigits.length - exponent;
  return scale <= 0
    ? { numerator: digits * powerOfTen(-scale), denominator: BIGINT_ONE }
    : { numerator: digits, denominator: powerOfTen(scale) };
}

function powerOfTen(exponent: number): bigint {
  let result = BIGINT_ONE;
  for (let index = 0; index < exponent; index += 1) result *= BIGINT_TEN;
  return result;
}

function divideHalfUp(value: bigint, divisor: bigint): bigint {
  return (value + divisor / BigInt(2)) / divisor;
}

function addRange(
  ranges: Map<DouyinBudgetCategoryCode, FenRange>,
  category: DouyinBudgetCategoryCode,
  range: FenRange,
): void {
  const current = ranges.get(category) ?? {
    minimum: BIGINT_ZERO,
    maximum: BIGINT_ZERO,
  };
  ranges.set(category, {
    minimum: current.minimum + range.minimum,
    maximum: current.maximum + range.maximum,
  });
}

function toSafeFen(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('DOUYIN_BUDGET_AMOUNT_OVERFLOW', '预算金额超出安全整数范围');
  }
  return Number(value);
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

function hasOnlyKeys(
  value: object,
  allowedKeys: readonly string[],
): boolean {
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

function fail(
  code: DouyinBudgetCalculationErrorCode,
  message: string,
): never {
  throw new DouyinBudgetCalculationError(code, message);
}
