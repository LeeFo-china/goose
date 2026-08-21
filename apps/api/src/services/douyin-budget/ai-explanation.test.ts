import { beforeAll, describe, expect, mock, test } from 'bun:test';
import type { DouyinBudgetAiAnalysis, DouyinBudgetEstimateResult } from '@gooes/domain';

import { Errors } from '@/errors/error-factory';
import type {
  DouyinBudgetAiEstimateRecord,
  DouyinBudgetAiLease,
} from '@/repositories/douyin-budget-ai';
import type { JwtPayload } from '@/utils/jwt';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

let Service: typeof import('./ai-explanation').DouyinBudgetAiExplanationService;

beforeAll(async () => {
  ({ DouyinBudgetAiExplanationService: Service } = await import(
    './ai-explanation'
  ));
});

const tenantId = '11111111-1111-4111-8111-111111111111';
const installationId = '22222222-2222-4222-8222-222222222222';
const estimateId = '44444444-4444-4444-8444-444444444444';
const subjectHash = 'a'.repeat(64);
const claimedAt = '2026-08-21T04:05:06.123456+00:00';
const user: JwtPayload = {
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
const estimateResult: DouyinBudgetEstimateResult = {
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
const analysis: DouyinBudgetAiAnalysis = {
  summary: '预算主要由基础施工和定制柜体构成。',
  allocation_advice: ['优先确认隐蔽工程范围。'],
  risk_factors: ['现场墙体情况可能影响施工方案。'],
  onsite_questions: ['量房时确认墙体和水电现状。'],
};
const baseRecord: DouyinBudgetAiEstimateRecord = {
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

function buildDependencies(overrides: Record<string, unknown> = {}) {
  const contextRepository = {
    findActiveInstallation: mock(async () => installation),
  };
  const claimed: {
    readonly action: 'claimed';
    readonly estimate: DouyinBudgetAiEstimateRecord;
    readonly lease: DouyinBudgetAiLease;
  } = {
    action: 'claimed' as const,
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

describe('DouyinBudgetAiExplanationService', () => {
  test('claims once, sends only a sanitized public snapshot, and completes with the database lease', async () => {
    const deps = buildDependencies();
    const response = await new Service(deps.values as never).generate(
      user,
      estimateId,
      false,
    );

    expect(response).toEqual({
      estimate: { ...estimateResult, ai_status: 'succeeded' },
      ai_analysis: analysis,
    });
    expect(deps.budgetRepository.claimAiAnalysis).toHaveBeenCalledWith({
      estimateId,
      tenantId,
      installationId,
      subjectHash,
      retry: false,
    });
    expect(deps.gateway.chat).toHaveBeenCalledTimes(1);
    const input = deps.gateway.chat.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input).toMatchObject({
      sceneCode: 'douyin_budget_explanation',
      tenantId,
      responseFormat: 'json_object',
      temperature: 0.2,
      timeoutMs: 30_000,
      source: 'douyin_miniapp',
      billable: true,
    });
    const prompt = JSON.stringify(input.messages);
    expect(prompt).toContain('105000');
    expect(prompt).toContain('155000');
    expect(prompt).toContain('[已脱敏]');
    expect(prompt).not.toContain('13800138000');
    expect(prompt).not.toContain('幸福路88号');
    expect(prompt).not.toContain(tenantId);
    expect(prompt).not.toContain(installationId);
    expect(prompt).not.toContain(estimateId);
    expect(prompt).not.toContain(subjectHash);
    expect(prompt).not.toContain('request_ip_hash');
    expect(prompt).not.toContain('condition_payload');
    expect(prompt).not.toContain('minimum_amount_fen');
    expect(deps.budgetRepository.completeAiAnalysis).toHaveBeenCalledWith({
      estimateId,
      tenantId,
      installationId,
      subjectHash,
      lease: { attemptCount: 1, claimedAt },
      analysis,
      provider: 'deepseek',
      model: 'deepseek-chat',
    });
  });

  test('returns saved terminal or live states without invoking AI', async () => {
    const savedRecords: DouyinBudgetAiEstimateRecord[] = [
      {
        ...baseRecord,
        ai_status: 'succeeded',
        ai_analysis: analysis,
        ai_provider: 'deepseek',
        ai_model: 'deepseek-chat',
        ai_claimed_at: null,
      },
      baseRecord,
      { ...baseRecord, ai_status: 'failed', ai_claimed_at: null },
      {
        ...baseRecord,
        ai_status: 'skipped',
        ai_attempt_count: 0,
        ai_claimed_at: null,
      },
    ];
    for (const record of savedRecords) {
      const deps = buildDependencies();
      deps.budgetRepository.claimAiAnalysis.mockResolvedValueOnce({
        action: 'saved',
        estimate: record,
      } as never);
      const response = await new Service(deps.values as never).generate(
        user,
        estimateId,
        false,
      );
      expect(response.estimate.ai_status).toBe(record.ai_status);
      expect(response.ai_analysis).toEqual(
        record.ai_status === 'succeeded' ? analysis : null,
      );
      expect(deps.gateway.chat).not.toHaveBeenCalled();
      expect(deps.budgetRepository.completeAiAnalysis).not.toHaveBeenCalled();
      expect(deps.budgetRepository.failAiAnalysis).not.toHaveBeenCalled();
    }
  });

  test('passes explicit retry semantics to the atomic claim command', async () => {
    const deps = buildDependencies();
    await new Service(deps.values as never).generate(user, estimateId, true);
    expect(deps.budgetRepository.claimAiAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ retry: true }),
    );
  });

  test('does not invoke AI when scope is hidden as not found or estimate is expired', async () => {
    for (const error of [
      Errors.business(404, '预算不存在', 'DOUYIN_BUDGET_ESTIMATE_NOT_FOUND'),
      Errors.business(410, '预算已过期', 'DOUYIN_BUDGET_ESTIMATE_EXPIRED'),
    ]) {
      const deps = buildDependencies();
      deps.budgetRepository.claimAiAnalysis.mockRejectedValueOnce(error);
      await expect(
        new Service(deps.values as never).generate(user, estimateId, false),
      ).rejects.toMatchObject({ statusCode: error.statusCode, code: error.code });
      expect(deps.gateway.chat).not.toHaveBeenCalled();
    }
  });

  test('treats malformed persisted snapshots as database corruption without consuming the lease', async () => {
    const deps = buildDependencies();
    deps.budgetRepository.claimAiAnalysis.mockResolvedValueOnce({
      ...deps.claimed,
      estimate: {
        ...baseRecord,
        request_payload: { ...baseRecord.request_payload as object, area: 9 },
      },
    });
    await expect(
      new Service(deps.values as never).generate(user, estimateId, false),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: 'DOUYIN_BUDGET_PUBLIC_RESULT_INVALID',
    });
    expect(deps.gateway.chat).not.toHaveBeenCalled();
    expect(deps.budgetRepository.failAiAnalysis).not.toHaveBeenCalled();
    expect(deps.budgetRepository.completeAiAnalysis).not.toHaveBeenCalled();
  });

  test('redacts a landline without suppressing non-address demand context', async () => {
    const deps = buildDependencies();
    deps.budgetRepository.claimAiAnalysis.mockResolvedValueOnce({
      ...deps.claimed,
      estimate: {
        ...baseRecord,
        request_payload: {
          ...baseRecord.request_payload as object,
          demand: '电话0376-1234567，需要更多收纳',
        },
      },
    });
    await new Service(deps.values as never).generate(user, estimateId, false);
    const prompt = JSON.stringify(deps.gateway.chat.mock.calls[0]?.[0]);
    expect(prompt).toContain('需要更多收纳');
    expect(prompt).toContain('[已脱敏]');
    expect(prompt).not.toContain('0376-1234567');
  });

  test('records a stable timeout code without leaking gateway details', async () => {
    const deps = buildDependencies();
    deps.gateway.chat.mockRejectedValueOnce(
      Errors.business(504, 'provider timeout secret', 'AI_GATEWAY_TIMEOUT'),
    );
    await new Service(deps.values as never).generate(user, estimateId, false);
    expect(deps.budgetRepository.failAiAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'DOUYIN_BUDGET_AI_TIMEOUT' }),
    );
    expect(JSON.stringify(deps.budgetRepository.failAiAnalysis.mock.calls))
      .not.toContain('provider timeout secret');
  });

  test('atomically records gateway, timeout, malformed, amount-bearing, and overlong failures', async () => {
    const invalidContents = [
      new Error('provider secret 192.0.2.10'),
      { content: '{not-json', provider: 'deepseek', model: 'deepseek-chat' },
      {
        content: JSON.stringify({ ...analysis, amount: 120_000 }),
        provider: 'deepseek',
        model: 'deepseek-chat',
      },
      {
        content: JSON.stringify({ ...analysis, summary: 'x'.repeat(1_001) }),
        provider: 'deepseek',
        model: 'deepseek-chat',
      },
    ];
    for (const outcome of invalidContents) {
      const deps = buildDependencies();
      deps.gateway.chat.mockImplementationOnce(async () => {
        if (outcome instanceof Error) throw outcome;
        return outcome;
      });
      const response = await new Service(deps.values as never).generate(
        user,
        estimateId,
        false,
      );
      expect(response).toEqual({
        estimate: { ...estimateResult, ai_status: 'failed' },
        ai_analysis: null,
      });
      expect(deps.budgetRepository.failAiAnalysis).toHaveBeenCalledTimes(1);
      expect(deps.budgetRepository.failAiAnalysis.mock.calls[0]?.[0]).toMatchObject({
        estimateId,
        tenantId,
        installationId,
        subjectHash,
        lease: { attemptCount: 1, claimedAt },
      });
      expect(JSON.stringify(deps.budgetRepository.failAiAnalysis.mock.calls[0]?.[0]))
        .not.toContain('provider secret');
    }
  });

  test('returns current state when a stale worker loses its completion or failure lease', async () => {
    const deps = buildDependencies();
    deps.budgetRepository.completeAiAnalysis.mockResolvedValueOnce({
      ...baseRecord,
      ai_status: 'pending',
      ai_attempt_count: 2,
      ai_claimed_at: '2026-08-21T04:06:20.654321+00:00',
    } as never);
    await expect(
      new Service(deps.values as never).generate(user, estimateId, false),
    ).resolves.toEqual({
      estimate: { ...estimateResult, ai_status: 'pending' },
      ai_analysis: null,
    });

    const failedDeps = buildDependencies();
    failedDeps.gateway.chat.mockRejectedValueOnce(new Error('timeout'));
    failedDeps.budgetRepository.failAiAnalysis.mockResolvedValueOnce({
      ...baseRecord,
      ai_status: 'succeeded',
      ai_analysis: analysis,
      ai_provider: 'deepseek',
      ai_model: 'deepseek-chat',
      ai_claimed_at: null,
    } as never);
    await expect(
      new Service(failedDeps.values as never).generate(user, estimateId, false),
    ).resolves.toEqual({
      estimate: { ...estimateResult, ai_status: 'succeeded' },
      ai_analysis: analysis,
    });
  });

  test('never reports a fake failed state when the failure command itself fails', async () => {
    const deps = buildDependencies();
    deps.gateway.chat.mockRejectedValueOnce(new Error('timeout'));
    deps.budgetRepository.failAiAnalysis.mockRejectedValueOnce(
      Errors.business(500, '预算数据操作失败', 'DOUYIN_BUDGET_REPOSITORY_ERROR'),
    );
    await expect(
      new Service(deps.values as never).generate(user, estimateId, false),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: 'DOUYIN_BUDGET_REPOSITORY_ERROR',
    });
  });

  test('allows only one gateway call when two requests race for the same claim', async () => {
    const deps = buildDependencies();
    let claims = 0;
    deps.budgetRepository.claimAiAnalysis.mockImplementation(async () => {
      claims += 1;
      return claims === 1
        ? deps.claimed
        : { action: 'saved', estimate: baseRecord };
    });
    const service = new Service(deps.values as never);
    const responses = await Promise.all([
      service.generate(user, estimateId, false),
      service.generate(user, estimateId, false),
    ]);
    expect(responses.map((response) => response.estimate.ai_status).sort()).toEqual([
      'pending',
      'succeeded',
    ]);
    expect(deps.gateway.chat).toHaveBeenCalledTimes(1);
  });
});
