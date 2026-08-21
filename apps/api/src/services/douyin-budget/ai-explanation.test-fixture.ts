import { mock } from 'bun:test';
import type {
  DouyinBudgetAiAnalysis,
  DouyinBudgetEstimateResult,
} from '@gooes/domain';

import type {
  DouyinBudgetAiEstimateRecord,
  DouyinBudgetAiLease,
} from '@/repositories/douyin-budget-ai';
import type { JwtPayload } from '@/utils/jwt';

export const tenantId = '11111111-1111-4111-8111-111111111111';
export const installationId = '22222222-2222-4222-8222-222222222222';
export const estimateId = '44444444-4444-4444-8444-444444444444';
export const subjectHash = 'a'.repeat(64);
export const claimedAt = '2026-08-21T04:05:06.123456+00:00';
export const user: JwtPayload = {
  sub: subjectHash,
  token_type: 'douyin_miniapp',
  login_channel: 'douyin',
  roles: ['douyin_miniapp'],
  tenant_id: tenantId,
  douyin_installation_id: installationId,
  douyin_app_id: 'tt-authorizer-1',
  subject_hash: subjectHash,
};
const installation = {
  id: installationId,
  tenant_id: tenantId,
  authorizer_appid: 'tt-authorizer-1',
  installation_kind: 'merchant',
  authorization_status: 'active',
  template_version: '1.0.0',
  runtime_config: {},
  tenant: { id: tenantId, status: 'active' },
};
export const estimateResult: DouyinBudgetEstimateResult = {
  id: estimateId,
  estimate_no: 'DYYS-20260821-000042',
  minimum_total: 105_000,
  maximum_total: 155_000,
  categories: [
    {
      category_code: 'base',
      label: '基础施工',
      minimum_amount: 100_000,
      maximum_amount: 150_000,
    },
    {
      category_code: 'custom',
      label: '定制',
      minimum_amount: 5_000,
      maximum_amount: 5_000,
    },
  ],
  calculation_basis: ['100㎡、舒适档、毛坯房、全屋装修'],
  included_items: ['舒适档毛坯基础施工', '定制柜体'],
  excluded_items: ['家电', '软装'],
  pricing_version: '7',
  pricing_effective_from: '2026-08-20T00:00:00.000Z',
  pricing_effective_to: null,
  disclaimer: '初步估算，不构成最终报价',
  ai_status: 'pending',
};
export const analysis: DouyinBudgetAiAnalysis = {
  summary: '预算主要由基础施工和定制柜体构成。',
  allocation_advice: ['优先确认隐蔽工程范围。'],
  risk_factors: ['现场墙体情况可能影响施工方案。'],
  onsite_questions: ['量房时确认墙体和水电现状。'],
};
export const baseRecord: DouyinBudgetAiEstimateRecord = {
  id: estimateId,
  estimate_no: estimateResult.estimate_no,
  tenant_id: tenantId,
  douyin_miniapp_installation_id: installationId,
  subject_hash: subjectHash,
  request_payload: {
    area: 100,
    property_condition: 'rough',
    decoration_tier: 'comfortable',
    decoration_scope: 'whole_house',
    layout: '三室两厅',
    style: '现代简约',
    option_codes: ['custom_cabinet'],
    demand: '联系13800138000，幸福路88号3栋2单元501室，需要更多收纳',
  },
  result_payload: estimateResult,
  ai_status: 'pending',
  ai_analysis: null,
  ai_provider: null,
  ai_model: null,
  ai_attempt_count: 1,
  ai_claimed_at: claimedAt,
  expires_at: '2026-09-20T04:05:06.000Z',
};

export function buildDependencies(overrides: Record<string, unknown> = {}) {
  const contextRepository = {
    findActiveInstallation: mock(async () => installation),
  };
  const claimed: {
    readonly action: 'claimed';
    readonly estimate: DouyinBudgetAiEstimateRecord;
    readonly lease: DouyinBudgetAiLease;
  } = {
    action: 'claimed',
    estimate: baseRecord,
    lease: { attemptCount: 1, claimedAt },
  };
  const completedRecord: DouyinBudgetAiEstimateRecord = {
    ...baseRecord,
    ai_status: 'succeeded',
    ai_analysis: analysis,
    ai_provider: 'deepseek',
    ai_model: 'deepseek-chat',
    ai_claimed_at: null,
  };
  const failedRecord: DouyinBudgetAiEstimateRecord = {
    ...baseRecord,
    ai_status: 'failed',
    ai_analysis: null,
    ai_provider: null,
    ai_model: null,
    ai_claimed_at: null,
  };
  const budgetRepository = {
    claimAiAnalysis: mock(async (_input: unknown): Promise<
      | typeof claimed
      | { readonly action: 'saved'; readonly estimate: DouyinBudgetAiEstimateRecord }
    > => claimed),
    completeAiAnalysis: mock(async (_input: unknown) => completedRecord),
    failAiAnalysis: mock(async (_input: unknown) => failedRecord),
  };
  const gateway = {
    chat: mock(async (_input: unknown) => ({
      content: JSON.stringify(analysis),
      provider: 'deepseek',
      model: 'deepseek-chat',
    })),
  };
  return {
    values: { contextRepository, budgetRepository, aiGateway: gateway, ...overrides },
    contextRepository,
    budgetRepository,
    gateway,
    claimed,
    completedRecord,
    failedRecord,
  };
}
