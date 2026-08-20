import { describe, expect, test } from 'bun:test';

import * as domain from './index';
import * as shared from './shared';
import {
  DOUYIN_BUDGET_AI_STATUS_VALUES,
  DOUYIN_BUDGET_CATEGORY_CODE_VALUES,
  DOUYIN_BUDGET_OPTION_CODE_VALUES,
  DOUYIN_DECORATION_SCOPE_VALUES,
  DOUYIN_DECORATION_TIER_VALUES,
  DOUYIN_PROPERTY_CONDITION_VALUES,
  DouyinBudgetAiAnalysisSchema,
  DouyinBudgetEstimateRequestSchema,
  DouyinBudgetEstimateResultSchema,
  type DouyinBudgetAiAnalysis,
  type DouyinBudgetEstimateResult,
} from './douyin-budget';

const validRequest = {
  area: 110,
  property_condition: 'rough',
  decoration_tier: 'comfortable',
  decoration_scope: 'whole_house',
  layout: '三室两厅',
  style: '现代简约',
  option_codes: ['custom_cabinet'],
  demand: '需要较多收纳',
} as const;

const validResult: DouyinBudgetEstimateResult = {
  id: '22222222-2222-4222-8222-222222222222',
  estimate_no: 'DYYS-20260820-000001',
  minimum_total: 110_000,
  maximum_total: 140_000,
  categories: [
    {
      category_code: 'base',
      label: '基础施工',
      minimum_amount: 90_000,
      maximum_amount: 110_000,
    },
    {
      category_code: 'custom',
      label: '定制',
      minimum_amount: 20_000,
      maximum_amount: 30_000,
    },
  ],
  calculation_basis: ['110㎡、舒适档、毛坯房、全屋装修'],
  included_items: ['基础施工', '定制柜体'],
  excluded_items: ['家电', '软装'],
  pricing_version: '1',
  pricing_effective_from: '2026-08-20T00:00:00Z',
  pricing_effective_to: '2026-09-20T08:00:00+08:00',
  disclaimer: '初步估算，不构成最终报价',
  ai_status: 'pending',
};

const validAiAnalysis: DouyinBudgetAiAnalysis = {
  summary: '整体需求以收纳和基础施工为主。',
  allocation_advice: ['优先保留基础施工和水电改造。'],
  risk_factors: ['定制柜体的材料选择可能影响预算。'],
  onsite_questions: ['量房时需要确认墙体和水电现状。'],
};

describe('douyin budget contracts', () => {
  test('keeps the public condition, tier, scope, option, category and AI values stable', () => {
    expect(DOUYIN_PROPERTY_CONDITION_VALUES).toEqual(['rough', 'old_house']);
    expect(DOUYIN_DECORATION_TIER_VALUES).toEqual([
      'economy',
      'comfortable',
      'quality',
    ]);
    expect(DOUYIN_DECORATION_SCOPE_VALUES).toEqual([
      'whole_house',
      'partial',
    ]);
    expect(DOUYIN_BUDGET_OPTION_CODE_VALUES).toEqual([
      'demolition',
      'water_electricity_upgrade',
      'custom_cabinet',
    ]);
    expect(DOUYIN_BUDGET_CATEGORY_CODE_VALUES).toEqual([
      'base',
      'water_electricity',
      'materials',
      'custom',
      'other',
    ]);
    expect(DOUYIN_BUDGET_AI_STATUS_VALUES).toEqual([
      'pending',
      'succeeded',
      'failed',
      'skipped',
    ]);
  });

  test('accepts a bounded anonymous request and normalizes free text and option codes', () => {
    expect(DouyinBudgetEstimateRequestSchema.parse({
      ...validRequest,
      option_codes: [' custom_cabinet ', ' demolition '],
      demand: '  需要较多收纳  ',
    })).toEqual({
      ...validRequest,
      option_codes: ['custom_cabinet', 'demolition'],
      demand: '需要较多收纳',
    });
  });

  test('enforces request bounds, unique options and strict fields', () => {
    const invalidRequests = [
      { ...validRequest, area: 9.99 },
      { ...validRequest, area: 1_000.01 },
      { ...validRequest, demand: 'x'.repeat(1_001) },
      {
        ...validRequest,
        option_codes: Array.from({ length: 21 }, () => 'custom_cabinet'),
      },
      {
        ...validRequest,
        option_codes: ['custom_cabinet', ' custom_cabinet '],
      },
      { ...validRequest, option_codes: ['final_price_quote'] },
      { ...validRequest, phone: '13800138000' },
    ];

    for (const request of invalidRequests) {
      expect(DouyinBudgetEstimateRequestSchema.safeParse(request).success).toBe(
        false,
      );
    }

    const oversizedOptions = DouyinBudgetEstimateRequestSchema.safeParse({
      ...validRequest,
      option_codes: Array.from({ length: 21 }, () => 'custom_cabinet'),
    });
    expect(oversizedOptions.success).toBe(false);
    if (!oversizedOptions.success) {
      expect(oversizedOptions.error.issues.map((issue) => issue.code)).toContain(
        'too_big',
      );
    }
  });

  test('accepts strict result amounts as non-negative integer yuan', () => {
    expect(DouyinBudgetEstimateResultSchema.parse(validResult)).toEqual(
      validResult,
    );

    for (const value of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1]) {
      expect(DouyinBudgetEstimateResultSchema.safeParse({
        ...validResult,
        minimum_total: value,
      }).success).toBe(false);
    }

    expect(DouyinBudgetEstimateResultSchema.safeParse({
      ...validResult,
      internal_pricing_rule: 'secret',
    }).success).toBe(false);
  });

  test('rejects invalid public identifiers and inverted category or total ranges', () => {
    const invalidResults = [
      { ...validResult, id: 'estimate-id' },
      { ...validResult, estimate_no: '22222222-2222-4222-8222-222222222222' },
      { ...validResult, minimum_total: 200_000, maximum_total: 100_000 },
      {
        ...validResult,
        categories: [
          {
            ...validResult.categories[0],
            minimum_amount: 120_000,
            maximum_amount: 110_000,
          },
        ],
      },
      { ...validResult, ai_status: 'completed' },
    ];

    for (const result of invalidResults) {
      expect(DouyinBudgetEstimateResultSchema.safeParse(result).success).toBe(
        false,
      );
    }
  });

  test('rejects duplicate result categories', () => {
    expect(DouyinBudgetEstimateResultSchema.safeParse({
      ...validResult,
      categories: [validResult.categories[0], validResult.categories[0]],
    }).success).toBe(false);
  });

  test('accepts UTC and offset pricing validity with an optional end time', () => {
    expect(DouyinBudgetEstimateResultSchema.parse(validResult)).toEqual(
      validResult,
    );
    const validPricingDateTimes = [
      '2026-08-20T00:00:00Z',
      '2026-08-20T00:00:00.1Z',
      '2026-08-20T00:00:00.12+00:00',
      '2026-08-20T08:00:00.123+08:00',
    ];
    for (const pricingEffectiveFrom of validPricingDateTimes) {
      expect(DouyinBudgetEstimateResultSchema.safeParse({
        ...validResult,
        pricing_effective_from: pricingEffectiveFrom,
        pricing_effective_to: null,
      }).success).toBe(true);
    }
    expect(DouyinBudgetEstimateResultSchema.safeParse({
      ...validResult,
      pricing_effective_from: '2026-08-20T00:00:00.123Z',
      pricing_effective_to: '2026-08-20T00:00:00.124Z',
    }).success).toBe(true);
    expect(DouyinBudgetEstimateResultSchema.parse({
      ...validResult,
      pricing_effective_from: '2026-08-20T08:00:00+08:00',
      pricing_effective_to: null,
    }).pricing_effective_to).toBeNull();
  });

  test('rejects invalid or non-increasing pricing validity', () => {
    const invalidResults = [
      { ...validResult, pricing_effective_from: '2026-08-20' },
      { ...validResult, pricing_effective_to: 'not-a-datetime' },
      {
        ...validResult,
        pricing_effective_from: '2026-08-20T00:00:00Z',
        pricing_effective_to: '2026-08-20T08:00:00+08:00',
      },
      {
        ...validResult,
        pricing_effective_from: '2026-08-20T00:00:01Z',
        pricing_effective_to: '2026-08-20T00:00:00Z',
      },
      {
        ...validResult,
        pricing_effective_from: '2026-08-20T00:00:00.1234Z',
        pricing_effective_to: '2026-08-20T00:00:00.124Z',
      },
      {
        ...validResult,
        pricing_effective_from: '2026-08-20T00:00:00.123456Z',
        pricing_effective_to: '2026-08-20T00:00:00.124Z',
      },
    ];

    for (const result of invalidResults) {
      expect(DouyinBudgetEstimateResultSchema.safeParse(result).success).toBe(
        false,
      );
    }
  });

  test('accepts only bounded trimmed AI explanation fields without amount fields', () => {
    expect(DouyinBudgetAiAnalysisSchema.parse({
      ...validAiAnalysis,
      summary: `  ${validAiAnalysis.summary}  `,
      allocation_advice: ['  优先保留基础施工。  '],
    })).toEqual({
      ...validAiAnalysis,
      allocation_advice: ['优先保留基础施工。'],
    });

    const invalidAnalyses = [
      { ...validAiAnalysis, minimum_total: 110_000 },
      { ...validAiAnalysis, summary: 'x'.repeat(1_001) },
      { ...validAiAnalysis, risk_factors: [''] },
      {
        ...validAiAnalysis,
        allocation_advice: [{ category: 'base', amount: 90_000 }],
      },
    ];

    for (const analysis of invalidAnalyses) {
      expect(DouyinBudgetAiAnalysisSchema.safeParse(analysis).success).toBe(
        false,
      );
    }
  });

  const aiListFields = [
    'allocation_advice',
    'risk_factors',
    'onsite_questions',
  ] as const;

  for (const field of aiListFields) {
    test(`enforces text and array boundaries for AI ${field}`, () => {
      expect(DouyinBudgetAiAnalysisSchema.safeParse({
        ...validAiAnalysis,
        [field]: ['x'.repeat(300)],
      }).success).toBe(true);
      expect(DouyinBudgetAiAnalysisSchema.safeParse({
        ...validAiAnalysis,
        [field]: ['x'.repeat(301)],
      }).success).toBe(false);
      expect(DouyinBudgetAiAnalysisSchema.safeParse({
        ...validAiAnalysis,
        [field]: Array.from({ length: 10 }, () => 'x'),
      }).success).toBe(true);
      expect(DouyinBudgetAiAnalysisSchema.safeParse({
        ...validAiAnalysis,
        [field]: Array.from({ length: 11 }, () => 'x'),
      }).success).toBe(false);
    });
  }

  test('re-exports the same budget contracts from shared and the package root', () => {
    expect(shared.DouyinBudgetEstimateRequestSchema).toBe(
      DouyinBudgetEstimateRequestSchema,
    );
    expect(shared.DouyinBudgetEstimateResultSchema).toBe(
      DouyinBudgetEstimateResultSchema,
    );
    expect(shared.DouyinBudgetAiAnalysisSchema).toBe(
      DouyinBudgetAiAnalysisSchema,
    );
    expect(domain.DouyinBudgetEstimateRequestSchema).toBe(
      DouyinBudgetEstimateRequestSchema,
    );
    expect(domain.DouyinBudgetEstimateResultSchema).toBe(
      DouyinBudgetEstimateResultSchema,
    );
    expect(domain.DouyinBudgetAiAnalysisSchema).toBe(
      DouyinBudgetAiAnalysisSchema,
    );
  });
});
