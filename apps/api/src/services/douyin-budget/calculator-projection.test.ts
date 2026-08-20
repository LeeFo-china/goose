import { describe, expect, test } from 'bun:test';

import {
  DouyinBudgetCalculationError,
  projectDouyinBudgetToPublicYuan,
  type DouyinBudgetCalculationResult,
} from './calculator';

describe('projectDouyinBudgetToPublicYuan', () => {
  test.each([
    [99, 1],
    [100, 1],
    [149, 1],
    [150, 2],
  ])('rounds %s fen to %s yuan for totals and categories', (fen, yuan) => {
    const result = projectDouyinBudgetToPublicYuan(rawResult(fen));
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

  test('sums rounded categories for public totals', () => {
    const raw = rawResultForCategories([
      rawCategory('base', 50, 149),
      rawCategory('custom', 50, 150),
    ]);
    expect(projectDouyinBudgetToPublicYuan(raw)).toMatchObject({
      minimum_total: 2,
      maximum_total: 3,
      categories: [
        { category_code: 'base', minimum_amount: 1, maximum_amount: 1 },
        { category_code: 'custom', minimum_amount: 1, maximum_amount: 2 },
      ],
    });
  });

  test.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid raw total fen %s',
    (fen) => {
      expectCalculationFailure('DOUYIN_BUDGET_RULE_AMOUNT_INVALID', () =>
        projectDouyinBudgetToPublicYuan({
          ...rawResult(0),
          minimum_total_fen: fen,
          maximum_total_fen: fen,
        })
      );
    },
  );

  test.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid raw category fen %s',
    (fen) => {
      expectCalculationFailure('DOUYIN_BUDGET_RULE_AMOUNT_INVALID', () =>
        projectDouyinBudgetToPublicYuan({
          ...rawResult(0),
          categories: [rawCategory('base', fen)],
        })
      );
    },
  );

  test.each([
    ['empty', []],
    ['duplicate', [rawCategory('base', 50), rawCategory('base', 50)]],
    ['out of order', [rawCategory('custom', 50), rawCategory('base', 50)]],
    ['unknown', [rawCategory('legacy', 50)]],
  ])('rejects %s raw categories', (_name, categories) => {
    expectCalculationFailure('DOUYIN_BUDGET_RULE_INVALID', () =>
      projectDouyinBudgetToPublicYuan(rawResultForCategories(
        categories as DouyinBudgetCalculationResult['categories'],
      ))
    );
  });

  test('rejects inverted raw total and category ranges', () => {
    const raw = rawResult(150);
    expectCalculationFailure('DOUYIN_BUDGET_RULE_AMOUNT_INVALID', () =>
      projectDouyinBudgetToPublicYuan({
        ...raw,
        minimum_total_fen: 151,
        maximum_total_fen: 150,
      })
    );
    expectCalculationFailure('DOUYIN_BUDGET_RULE_AMOUNT_INVALID', () =>
      projectDouyinBudgetToPublicYuan({
        ...raw,
        categories: [rawCategory('base', 151, 150)],
      })
    );
  });

  test.each([
    ['minimum_total_fen', 149],
    ['maximum_total_fen', 151],
  ] as const)('rejects mismatched raw %s', (field, value) => {
    expectCalculationFailure('DOUYIN_BUDGET_RULE_AMOUNT_INVALID', () =>
      projectDouyinBudgetToPublicYuan({ ...rawResult(150), [field]: value })
    );
  });

  test('preserves basis and item lists without mutating raw input', () => {
    const raw = rawResult(150);
    const before = structuredClone(raw);
    const projected = projectDouyinBudgetToPublicYuan(raw);
    expect(raw).toEqual(before);
    expect(projected.calculation_basis).toEqual(raw.calculation_basis);
    expect(projected.included_items).toEqual(raw.included_items);
    expect(projected.excluded_items).toEqual(raw.excluded_items);
  });
});

function rawResult(amountFen: number): DouyinBudgetCalculationResult {
  return rawResultForCategories([rawCategory('base', amountFen)]);
}

function rawResultForCategories(
  categories: DouyinBudgetCalculationResult['categories'],
): DouyinBudgetCalculationResult {
  return {
    minimum_total_fen: categories.reduce(
      (sum, category) => sum + category.minimum_amount_fen,
      0,
    ),
    maximum_total_fen: categories.reduce(
      (sum, category) => sum + category.maximum_amount_fen,
      0,
    ),
    categories,
    calculation_basis: {
      area_sqm: 100,
      property_condition: 'rough',
      property_condition_coefficient_bps: 10_000,
      decoration_tier: 'comfortable',
      decoration_scope: 'whole_house',
      decoration_scope_coefficient_bps: 10_000,
      selected_option_codes: [],
    },
    included_items: ['舒适型基础施工'],
    excluded_items: ['定制柜体'],
  };
}

function rawCategory(
  categoryCode: string,
  minimumAmountFen: number,
  maximumAmountFen = minimumAmountFen,
): DouyinBudgetCalculationResult['categories'][number] {
  return {
    category_code: categoryCode as 'base',
    minimum_amount_fen: minimumAmountFen,
    maximum_amount_fen: maximumAmountFen,
  };
}

function expectCalculationFailure(code: string, action: () => unknown): void {
  let failure: unknown = null;
  try {
    action();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(DouyinBudgetCalculationError);
  expect(failure).toMatchObject({ code });
}
