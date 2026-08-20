import { describe, expect, test } from 'bun:test';

import {
  calculateDouyinBudget,
  DouyinBudgetCalculationError,
  projectDouyinBudgetToPublicYuan,
  type DouyinBudgetCalculatorInput,
  type DouyinBudgetCalculationResult,
  type DouyinBudgetPricingRules,
} from './calculator';

const rules = {
  versionId: '11111111-1111-4111-8111-111111111111',
  versionNo: 1,
  disclaimer: '初步估算，不构成最终报价',
  items: [
    {
      role: 'base',
      code: 'base.comfortable.rough',
      category: 'base',
      label: '舒适型基础施工',
      unit: 'sqm',
      minimumAmountFen: 90_000,
      maximumAmountFen: 110_000,
      propertyConditionCoefficientBps: 10_000,
      decorationScopeCoefficientBps: {
        whole_house: 10_000,
        partial: 6_000,
      },
      condition: {
        propertyConditions: ['rough'],
        decorationTiers: ['comfortable'],
      },
    },
    {
      role: 'option',
      code: 'custom_cabinet',
      category: 'custom',
      label: '定制柜体',
      unit: 'fixed',
      minimumAmountFen: 2_000_000,
      maximumAmountFen: 3_000_000,
      condition: {},
    },
  ],
} as const;

describe('calculateDouyinBudget', () => {
  test('replays coefficients from the matching versioned base item', () => {
    const versionTwo = {
      ...rules,
      versionId: '22222222-2222-4222-8222-222222222222',
      versionNo: 2,
      disclaimer: '版本二预算说明',
      items: [{
        ...rules.items[0],
        code: 'base.comfortable.old_house',
        label: '旧房舒适型基础施工',
        minimumAmountFen: 100,
        maximumAmountFen: 100,
        propertyConditionCoefficientBps: 15_000,
        decorationScopeCoefficientBps: { whole_house: 10_000, partial: 5_000 },
        condition: {
          propertyConditions: ['old_house'],
          decorationTiers: ['comfortable'],
        },
      }],
    } as const;
    const versionOne = {
      ...versionTwo,
      versionId: '11111111-1111-4111-8111-111111111111',
      versionNo: 1,
      items: [{
        ...versionTwo.items[0],
        propertyConditionCoefficientBps: 10_000,
      }],
    } as const;
    const input = {
      area: 10,
      property_condition: 'old_house',
      decoration_tier: 'comfortable',
      decoration_scope: 'partial',
      option_codes: [],
    } as const;
    const result = calculateDouyinBudget(versionTwo, input);
    expect(calculateDouyinBudget(versionOne, input).minimum_total_fen).toBe(500);
    expect(result.minimum_total_fen).toBe(750);
    expect(result.maximum_total_fen).toBe(750);
    expect(calculateDouyinBudget(versionTwo, input)).toEqual(result);
    expect(result.calculation_basis).toMatchObject({
      property_condition_coefficient_bps: 15_000,
      decoration_scope_coefficient_bps: 5_000,
    });
  });

  test('calculates raw fen category and total ranges', () => {
    const result = calculateDouyinBudget(rules, budgetInput({
      option_codes: ['custom_cabinet'],
    }));
    expect(result.minimum_total_fen).toBe(11_000_000);
    expect(result.maximum_total_fen).toBe(14_000_000);
    expect(result.categories).toEqual([
      {
        category_code: 'base',
        minimum_amount_fen: 9_000_000,
        maximum_amount_fen: 11_000_000,
      },
      {
        category_code: 'custom',
        minimum_amount_fen: 2_000_000,
        maximum_amount_fen: 3_000_000,
      },
    ]);
    expect(result.included_items).toEqual([
      '舒适型基础施工',
      '定制柜体',
    ]);
    expect(result.excluded_items).toEqual([]);
    expect(result.calculation_basis).toEqual({
      area_sqm: 100,
      property_condition: 'rough',
      property_condition_coefficient_bps: 10_000,
      decoration_tier: 'comfortable',
      decoration_scope: 'whole_house',
      decoration_scope_coefficient_bps: 10_000,
      selected_option_codes: ['custom_cabinet'],
    });
  });

  test.each([10, 1_000])(
    'accepts the area boundary %s without selected options',
    (area) => {
      const result = calculateDouyinBudget(rules, budgetInput({ area }));
      expect(result.minimum_total_fen).toBe(90_000 * area);
      expect(result.maximum_total_fen).toBe(110_000 * area);
      expect(result.included_items).toEqual(['舒适型基础施工']);
      expect(result.excluded_items).toEqual(['定制柜体']);
    },
  );

  test('uses exact old-house and partial basis points with half-up fen rounding', () => {
    const result = calculateDouyinBudget({
      ...rules,
      items: [{
        ...rules.items[0],
        code: 'base.comfortable.old-house-partial',
        minimumAmountFen: 1,
        maximumAmountFen: 3,
        propertyConditionCoefficientBps: 15_001,
        decorationScopeCoefficientBps: {
          whole_house: 10_000,
          partial: 5_001,
        },
        condition: {
          propertyConditions: ['old_house'],
          decorationTiers: ['comfortable'],
        },
      }],
    }, {
      area: 10,
      property_condition: 'old_house',
      decoration_tier: 'comfortable',
      decoration_scope: 'partial',
      option_codes: [],
    });
    expect(result.minimum_total_fen).toBe(8);
    expect(result.maximum_total_fen).toBe(23);
    expect(result.calculation_basis).toMatchObject({
      property_condition_coefficient_bps: 15_001,
      decoration_scope_coefficient_bps: 5_001,
    });
  });

  test('multiplies sqm options by area and aggregates in canonical category order', () => {
    const result = calculateDouyinBudget({
      ...rules,
      items: [
        {
          role: 'option',
          code: 'demolition',
          category: 'other',
          label: '拆除',
          unit: 'fixed',
          minimumAmountFen: 100,
          maximumAmountFen: 200,
          condition: { decorationScopes: ['whole_house'] },
        },
        rules.items[0],
        {
          role: 'option',
          code: 'custom_cabinet',
          category: 'materials',
          label: '主材升级',
          unit: 'fixed',
          minimumAmountFen: 300,
          maximumAmountFen: 400,
          condition: { decorationTiers: ['comfortable'] },
        },
        {
          role: 'option',
          code: 'water_electricity_upgrade',
          category: 'water_electricity',
          label: '水电重点改造',
          unit: 'sqm',
          minimumAmountFen: 10,
          maximumAmountFen: 20,
          condition: { propertyConditions: ['rough'] },
        },
      ],
    }, budgetInput({
      area: 10,
      option_codes: [
        'demolition',
        'water_electricity_upgrade',
        'custom_cabinet',
      ],
    }));
    expect(result.categories.map((item) => item.category_code)).toEqual([
      'base',
      'water_electricity',
      'materials',
      'other',
    ]);
    expect(result.minimum_total_fen).toBe(900_500);
    expect(result.maximum_total_fen).toBe(1_100_800);
  });

  test('uses the canonical decimal area as an exact fraction before rounding fen', () => {
    const result = calculateDouyinBudget({
      ...rules,
      items: [{
        ...rules.items[0],
        minimumAmountFen: 101,
        maximumAmountFen: 101,
      }],
    }, budgetInput({ area: Number('1.0125e1') }));
    expect(result.minimum_total_fen).toBe(1_023);
    expect(result.maximum_total_fen).toBe(1_023);
  });

  test('does not mutate inputs and is deterministic', () => {
    const mutableRules = structuredClone(rules);
    const input = {
      area: 100,
      property_condition: 'rough' as const,
      decoration_tier: 'comfortable' as const,
      decoration_scope: 'whole_house' as const,
      option_codes: ['custom_cabinet'],
    };
    const rulesBefore = structuredClone(mutableRules);
    const inputBefore = structuredClone(input);
    const first = calculateDouyinBudget(mutableRules, input);
    const second = calculateDouyinBudget(mutableRules, input);
    expect(first).toEqual(second);
    expect(mutableRules).toEqual(rulesBefore);
    expect(input).toEqual(inputBefore);
  });

  test.each([
    [
      'DOUYIN_BUDGET_BASE_MISSING',
      { ...rules, items: [rules.items[1]] },
      {},
    ],
    [
      'DOUYIN_BUDGET_BASE_AMBIGUOUS',
      { ...rules, items: [
        rules.items[0],
        { ...rules.items[0], code: 'base.alternate' },
      ] },
      {},
    ],
    [
      'DOUYIN_BUDGET_RULE_CODE_DUPLICATE',
      { ...rules, items: [
        rules.items[0], rules.items[1], { ...rules.items[1] },
      ] },
      {},
    ],
    ['DOUYIN_BUDGET_OPTION_DUPLICATE', rules, {
      option_codes: ['custom_cabinet', 'custom_cabinet'],
    }],
    ['DOUYIN_BUDGET_OPTION_UNKNOWN', rules, {
      option_codes: ['demolition'],
    }],
    [
      'DOUYIN_BUDGET_OPTION_NOT_APPLICABLE',
      { ...rules, items: [rules.items[0], {
        ...rules.items[1],
        condition: { decorationScopes: ['partial'] },
      }] },
      {},
    ],
  ])('rejects invalid selection with %s', (code, candidateRules, inputPatch) => {
    expectCalculationFailure(code, () => calculateDouyinBudget(
      candidateRules as unknown as DouyinBudgetPricingRules,
      budgetInput({
        option_codes: ['custom_cabinet'],
        ...inputPatch,
      } as Partial<DouyinBudgetCalculatorInput>),
    ));
  });

  test.each([
    ['negative', { minimumAmountFen: -1 }],
    ['fractional', { minimumAmountFen: 1.5 }],
    ['unsafe', { maximumAmountFen: Number.MAX_SAFE_INTEGER + 1 }],
    ['inverted', { minimumAmountFen: 110_001, maximumAmountFen: 110_000 }],
  ])('rejects %s rule amounts', (_name, amountPatch) => {
    const candidate = {
      ...rules,
      items: [{ ...rules.items[0], ...amountPatch }],
    } as DouyinBudgetPricingRules;
    expectCalculationFailure('DOUYIN_BUDGET_RULE_AMOUNT_INVALID', () =>
      calculateDouyinBudget(candidate, budgetInput())
    );
  });

  test.each([undefined, 0, -1, 1.5, 100_001, Number.MAX_SAFE_INTEGER + 1])(
    'rejects bad coefficient %s',
    (coefficient) => {
      const candidate = {
        ...rules,
        items: [{
          ...rules.items[0],
          propertyConditionCoefficientBps: coefficient,
        }],
      } as unknown as DouyinBudgetPricingRules;
      expectCalculationFailure('DOUYIN_BUDGET_COEFFICIENT_INVALID', () =>
        calculateDouyinBudget(candidate, budgetInput())
      );
    },
  );

  test.each([
    { whole_house: 10_000 },
    { whole_house: 10_000, partial: 6_000, legacy: 10_000 },
  ])('requires coefficient maps to cover exactly the domain values', (map) => {
    const candidate = {
      ...rules,
      items: [{
        ...rules.items[0],
        decorationScopeCoefficientBps: map,
      }],
    } as unknown as DouyinBudgetPricingRules;
    expectCalculationFailure('DOUYIN_BUDGET_COEFFICIENT_INVALID', () =>
      calculateDouyinBudget(candidate, budgetInput())
    );
  });

  test.each([
    ['empty', { decorationTiers: [] }],
    ['duplicate', { propertyConditions: ['rough', 'rough'] }],
    ['unknown', { decorationScopes: ['room'] }],
  ])('rejects %s condition arrays', (_name, condition) => {
    const candidate = {
      ...rules,
      items: [{ ...rules.items[0], condition }],
    } as unknown as DouyinBudgetPricingRules;
    expectCalculationFailure('DOUYIN_BUDGET_RULE_CONDITION_INVALID', () =>
      calculateDouyinBudget(candidate, budgetInput())
    );
  });

  test.each([9, 1_001, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid area %s',
    (area) => {
      expectCalculationFailure('DOUYIN_BUDGET_INPUT_INVALID', () =>
        calculateDouyinBudget(rules, budgetInput({ area }))
      );
    },
  );

  test('rejects a non-sqm base rule and unsafe calculated output', () => {
    const fixedBase = {
      ...rules,
      items: [{ ...rules.items[0], unit: 'fixed' }],
    } as unknown as DouyinBudgetPricingRules;
    expectCalculationFailure('DOUYIN_BUDGET_RULE_INVALID', () =>
      calculateDouyinBudget(fixedBase, budgetInput())
    );

    const coefficientOption = {
      ...rules,
      items: [rules.items[0], {
        ...rules.items[1],
        propertyConditionCoefficientBps: 10_000,
      }],
    } as unknown as DouyinBudgetPricingRules;
    expectCalculationFailure('DOUYIN_BUDGET_RULE_INVALID', () =>
      calculateDouyinBudget(coefficientOption, budgetInput())
    );

    const overflowing = {
      ...rules,
      items: [{
        ...rules.items[0],
        minimumAmountFen: Number.MAX_SAFE_INTEGER,
        maximumAmountFen: Number.MAX_SAFE_INTEGER,
      }],
    };
    expectCalculationFailure('DOUYIN_BUDGET_AMOUNT_OVERFLOW', () =>
      calculateDouyinBudget(overflowing, budgetInput({ area: 1_000 }))
    );
  });
});

describe('projectDouyinBudgetToPublicYuan', () => {
  test.each([
    [99, 1],
    [100, 1],
    [149, 1],
    [150, 2],
  ])('rounds %s fen to %s yuan for totals and categories', (fen, yuan) => {
    const raw = rawResult(fen);
    const result = projectDouyinBudgetToPublicYuan(raw);
    expect(result).toMatchObject({
      minimum_total: yuan,
      maximum_total: yuan,
      categories: [{
        category_code: 'base',
        minimum_amount: yuan,
        maximum_amount: yuan,
      }],
    });
  });

  test.each([
    [-1, 'DOUYIN_BUDGET_PUBLIC_PROJECTION_INVALID'],
    [1.5, 'DOUYIN_BUDGET_PUBLIC_PROJECTION_INVALID'],
    [Number.MAX_SAFE_INTEGER + 1, 'DOUYIN_BUDGET_AMOUNT_OVERFLOW'],
  ])('rejects invalid fen %s with a typed failure', (fen, code) => {
    expectCalculationFailure(code, () =>
      projectDouyinBudgetToPublicYuan(rawResult(fen))
    );
  });

  test('uses the same validation for category amounts and does not mutate input', () => {
    const raw = rawResult(150);
    const before = structuredClone(raw);
    const invalidCategory = {
      ...raw,
      categories: [{
        ...raw.categories[0],
        minimum_amount_fen: -1,
      }],
    } as DouyinBudgetCalculationResult;
    const projected = projectDouyinBudgetToPublicYuan(raw);
    expect(raw).toEqual(before);
    expect(projected.calculation_basis).toEqual(raw.calculation_basis);
    expect(projected.included_items).toEqual(raw.included_items);
    expect(projected.excluded_items).toEqual(raw.excluded_items);
    expectCalculationFailure('DOUYIN_BUDGET_PUBLIC_PROJECTION_INVALID', () =>
      projectDouyinBudgetToPublicYuan(invalidCategory)
    );
    expectCalculationFailure('DOUYIN_BUDGET_PUBLIC_PROJECTION_INVALID', () =>
      projectDouyinBudgetToPublicYuan({ ...raw,
        minimum_total_fen: 151, maximum_total_fen: 150 })
    );
  });
});

function budgetInput(
  patch: Partial<DouyinBudgetCalculatorInput> = {},
): DouyinBudgetCalculatorInput {
  return {
    area: 100,
    property_condition: 'rough',
    decoration_tier: 'comfortable',
    decoration_scope: 'whole_house',
    option_codes: [],
    ...patch,
  };
}
function expectCalculationFailure(code: string, action: () => unknown): void {
  expect(captureCalculationFailure(action)).toMatchObject({ code });
}
function captureCalculationFailure(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(DouyinBudgetCalculationError);
    return error;
  }
  return null;
}
function rawResult(amountFen: number): DouyinBudgetCalculationResult {
  const calculated = calculateDouyinBudget(rules, budgetInput());
  return {
    ...calculated,
    minimum_total_fen: amountFen,
    maximum_total_fen: amountFen,
    categories: [{
      category_code: 'base',
      minimum_amount_fen: amountFen,
      maximum_amount_fen: amountFen,
    }],
  };
}
