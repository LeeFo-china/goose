import { describe, expect, test } from 'bun:test';

import {
  calculateDouyinBudget,
  DouyinBudgetCalculationError,
  type DouyinBudgetPricingRules,
} from './calculator';

const rules = {
  versionId: '11111111-1111-4111-8111-111111111111',
  versionNo: 1,
  disclaimer: '初步估算，不构成最终报价',
  propertyConditionCoefficientBps: {
    rough: 10_000,
    old_house: 12_000,
  },
  decorationScopeCoefficientBps: {
    whole_house: 10_000,
    partial: 6_000,
  },
  items: [
    {
      role: 'base',
      code: 'base.comfortable.rough',
      category: 'base',
      label: '舒适型基础施工',
      unit: 'sqm',
      minimumAmountFen: 90_000,
      maximumAmountFen: 110_000,
      condition: {
        propertyConditions: ['rough'],
        decorationTiers: ['comfortable'],
        decorationScopes: ['whole_house'],
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
  test('calculates raw fen category and total ranges', () => {
    const result = calculateDouyinBudget(rules, {
      area: 100,
      property_condition: 'rough',
      decoration_tier: 'comfortable',
      decoration_scope: 'whole_house',
      option_codes: ['custom_cabinet'],
    });

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
      const result = calculateDouyinBudget(rules, {
        area,
        property_condition: 'rough',
        decoration_tier: 'comfortable',
        decoration_scope: 'whole_house',
        option_codes: [],
      });

      expect(result.minimum_total_fen).toBe(90_000 * area);
      expect(result.maximum_total_fen).toBe(110_000 * area);
      expect(result.included_items).toEqual(['舒适型基础施工']);
      expect(result.excluded_items).toEqual(['定制柜体']);
    },
  );

  test('uses exact old-house and partial basis points with half-up fen rounding', () => {
    const result = calculateDouyinBudget({
      ...rules,
      propertyConditionCoefficientBps: {
        rough: 10_000,
        old_house: 15_001,
      },
      decorationScopeCoefficientBps: {
        whole_house: 10_000,
        partial: 5_001,
      },
      items: [{
        ...rules.items[0],
        code: 'base.comfortable.old-house-partial',
        minimumAmountFen: 1,
        maximumAmountFen: 3,
        condition: {
          propertyConditions: ['old_house'],
          decorationTiers: ['comfortable'],
          decorationScopes: ['partial'],
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
    }, {
      area: 10,
      property_condition: 'rough',
      decoration_tier: 'comfortable',
      decoration_scope: 'whole_house',
      option_codes: [
        'demolition',
        'water_electricity_upgrade',
        'custom_cabinet',
      ],
    });

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
    }, {
      area: Number('1.0125e1'),
      property_condition: 'rough',
      decoration_tier: 'comfortable',
      decoration_scope: 'whole_house',
      option_codes: [],
    });

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
      {
        ...rules,
        items: [
          rules.items[0],
          { ...rules.items[0], code: 'base.alternate' },
        ],
      },
      {},
    ],
    [
      'DOUYIN_BUDGET_RULE_CODE_DUPLICATE',
      {
        ...rules,
        items: [rules.items[0], rules.items[1], { ...rules.items[1] }],
      },
      {},
    ],
    [
      'DOUYIN_BUDGET_OPTION_DUPLICATE',
      rules,
      { option_codes: ['custom_cabinet', 'custom_cabinet'] },
    ],
    [
      'DOUYIN_BUDGET_OPTION_UNKNOWN',
      rules,
      { option_codes: ['demolition'] },
    ],
    [
      'DOUYIN_BUDGET_OPTION_NOT_APPLICABLE',
      {
        ...rules,
        items: [
          rules.items[0],
          {
            ...rules.items[1],
            condition: { decorationScopes: ['partial'] },
          },
        ],
      },
      {},
    ],
  ])('rejects invalid selection with %s', (code, candidateRules, inputPatch) => {
    expect(captureCalculationFailure(() => calculateDouyinBudget(
      candidateRules as unknown as DouyinBudgetPricingRules,
      {
        area: 100,
        property_condition: 'rough',
        decoration_tier: 'comfortable',
        decoration_scope: 'whole_house',
        option_codes: ['custom_cabinet'],
        ...inputPatch,
      },
    ))).toMatchObject({ code });
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

    expect(captureCalculationFailure(() => calculateDouyinBudget(candidate, {
      area: 100,
      property_condition: 'rough',
      decoration_tier: 'comfortable',
      decoration_scope: 'whole_house',
      option_codes: [],
    }))).toMatchObject({ code: 'DOUYIN_BUDGET_RULE_AMOUNT_INVALID' });
  });

  test.each([0, -1, 1.5, 100_001, Number.MAX_SAFE_INTEGER + 1])(
    'rejects bad coefficient %s',
    (coefficient) => {
      const candidate = {
        ...rules,
        propertyConditionCoefficientBps: {
          rough: coefficient,
          old_house: 12_000,
        },
      };

      expect(captureCalculationFailure(() => calculateDouyinBudget(candidate, {
        area: 100,
        property_condition: 'rough',
        decoration_tier: 'comfortable',
        decoration_scope: 'whole_house',
        option_codes: [],
      }))).toMatchObject({ code: 'DOUYIN_BUDGET_COEFFICIENT_INVALID' });
    },
  );

  test.each([
    { rough: 10_000 },
    { rough: 10_000, old_house: 12_000, legacy: 10_000 },
  ])('requires coefficient maps to cover exactly the domain values', (map) => {
    const candidate = {
      ...rules,
      propertyConditionCoefficientBps: map,
    } as unknown as DouyinBudgetPricingRules;

    expect(captureCalculationFailure(() => calculateDouyinBudget(candidate, {
      area: 100,
      property_condition: 'rough',
      decoration_tier: 'comfortable',
      decoration_scope: 'whole_house',
      option_codes: [],
    }))).toMatchObject({ code: 'DOUYIN_BUDGET_COEFFICIENT_INVALID' });
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

    expect(captureCalculationFailure(() => calculateDouyinBudget(candidate, {
      area: 100,
      property_condition: 'rough',
      decoration_tier: 'comfortable',
      decoration_scope: 'whole_house',
      option_codes: [],
    }))).toMatchObject({ code: 'DOUYIN_BUDGET_RULE_CONDITION_INVALID' });
  });

  test.each([9, 1_001, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid area %s',
    (area) => {
      expect(captureCalculationFailure(() => calculateDouyinBudget(rules, {
        area,
        property_condition: 'rough',
        decoration_tier: 'comfortable',
        decoration_scope: 'whole_house',
        option_codes: [],
      }))).toMatchObject({ code: 'DOUYIN_BUDGET_INPUT_INVALID' });
    },
  );

  test('rejects a non-sqm base rule and unsafe calculated output', () => {
    const fixedBase = {
      ...rules,
      items: [{ ...rules.items[0], unit: 'fixed' }],
    } as unknown as DouyinBudgetPricingRules;
    expect(captureCalculationFailure(() => calculateDouyinBudget(fixedBase, {
      area: 100,
      property_condition: 'rough',
      decoration_tier: 'comfortable',
      decoration_scope: 'whole_house',
      option_codes: [],
    }))).toMatchObject({ code: 'DOUYIN_BUDGET_RULE_INVALID' });

    const overflowing = {
      ...rules,
      items: [{
        ...rules.items[0],
        minimumAmountFen: Number.MAX_SAFE_INTEGER,
        maximumAmountFen: Number.MAX_SAFE_INTEGER,
      }],
    };
    expect(captureCalculationFailure(() => calculateDouyinBudget(overflowing,
      {
        area: 1_000,
        property_condition: 'rough',
        decoration_tier: 'comfortable',
        decoration_scope: 'whole_house',
        option_codes: [],
      },
    ))).toMatchObject({ code: 'DOUYIN_BUDGET_AMOUNT_OVERFLOW' });
  });
});

function captureCalculationFailure(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(DouyinBudgetCalculationError);
    return error;
  }
  return null;
}
