import { beforeAll, describe, expect, test } from 'bun:test';
import type { DouyinBudgetAiAnalysis } from '@gooes/domain';

import { Errors } from '@/errors/error-factory';
import type { DouyinBudgetAiEstimateRecord } from '@/repositories/douyin-budget-ai';

import {
  analysis,
  baseRecord,
  buildDependencies,
  claimedAt,
  estimateId,
  estimateResult,
  installationId,
  subjectHash,
  tenantId,
  user,
} from './ai-explanation.test-fixture';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

let Service: typeof import('./ai-explanation').DouyinBudgetAiExplanationService;

beforeAll(async () => {
  ({ DouyinBudgetAiExplanationService: Service } = await import(
    './ai-explanation'
  ));
});

describe('DouyinBudgetAiExplanationService', () => {
  test('claims once, sends only a sanitized public snapshot, and completes with the database lease', async () => {
    const deps = buildDependencies();
    deps.budgetRepository.claimAiAnalysis.mockResolvedValueOnce({
      ...deps.claimed,
      estimate: {
        ...baseRecord,
        request_payload: {
          ...baseRecord.request_payload as object,
          layout: '三室两厅，联系138-0013-8000',
          style: '幸福大道88号3栋的现代风',
        },
        result_payload: {
          ...estimateResult,
          categories: estimateResult.categories.map((category, index) => ({
            ...category,
            label: index === 0 ? '基础施工138　0013　8000' : category.label,
          })),
          calculation_basis: ['幸福大道88号3栋的规则依据'],
          included_items: [
            '联系0376-1234567确认施工',
            '预算编号9138001380001应保留',
          ],
          excluded_items: ['王府弄5号不在服务范围'],
          disclaimer: '详情联系138 0013 8000',
        },
      },
    });
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
    expect(prompt).not.toContain('三室两厅');
    expect(prompt).not.toContain('幸福大道88号3栋的现代风');
    expect(prompt).not.toContain('需要更多收纳');
    expect(prompt).toContain('预算编号9138001380001应保留');
    expect(prompt).toContain('[已脱敏]');
    for (const pii of [
      '138-0013-8000', '138　0013　8000', '138 0013 8000',
      '幸福大道88号3栋', '幸福路88号', '0376-1234567',
      '王府弄5号', '13900139000',
    ]) {
      expect(prompt).not.toContain(pii);
    }
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

  test('fail-closes historical saved unsafe analysis at the read boundary', async () => {
    const deps = buildDependencies();
    const historicalAnalysis: DouyinBudgetAiAnalysis = {
      summary: '联系138-0013-8000确认预算。',
      allocation_advice: ['可拨打138 0013 8000咨询。'],
      risk_factors: ['幸福大道88号3栋需要复核。'],
      onsite_questions: ['门牌号66是否准确？'],
    };
    deps.budgetRepository.claimAiAnalysis.mockResolvedValueOnce({
      action: 'saved',
      estimate: {
        ...baseRecord,
        ai_status: 'succeeded',
        ai_analysis: historicalAnalysis,
        ai_provider: 'deepseek',
        ai_model: 'deepseek-chat',
        ai_claimed_at: null,
      },
    } as never);

    await expect(
      new Service(deps.values as never).generate(user, estimateId, false),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: 'DOUYIN_BUDGET_PUBLIC_RESULT_INVALID',
    });
    expect(deps.gateway.chat).not.toHaveBeenCalled();
    expect(deps.budgetRepository.completeAiAnalysis).not.toHaveBeenCalled();
    expect(deps.budgetRepository.failAiAnalysis).not.toHaveBeenCalled();
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

  test('omits landline-bearing demand instead of forwarding free text', async () => {
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
    expect(prompt).not.toContain('需要更多收纳');
    expect(prompt).not.toContain('0376-1234567');
  });

  test('omits renovation free text while sanitizing deterministic addresses', async () => {
    const deps = buildDependencies();
    const addresses = [
      '建设大道12', '人民路88', '中山街12', '梧桐巷8', '王府弄5',
      '建设大道12靠近地铁', '人民路88附近量房', '中山街12需要复核', '梧桐巷8可以上门', '王府弄5安排测量',
      '幸福路3号楼', '幸福路5栋', '幸福村',
      '春风小区', '6号楼', '3栋',
      '2幢', '1单元', '门牌号66', '501室',
    ];
    deps.budgetRepository.claimAiAnalysis.mockResolvedValueOnce({
      ...deps.claimed,
      estimate: {
        ...baseRecord,
        request_payload: {
          ...baseRecord.request_payload as object,
          layout: '卧室电路 220V需要调整；厨房水路12米需要改造',
          style: '装修思路 2026版；全屋线路20米需要更换',
          demand: '卧室电路220伏、装修思路2026版、卧室电路220，装修思路2026、施工道路8米宽、全屋回路30厘米、厨房管路500毫米、空调风路2公分、燃气气路3㎡、设备油路4m、施工支路6米宽都需要保留',
        },
        result_payload: {
          ...estimateResult,
          calculation_basis: addresses,
        },
      },
    });
    await new Service(deps.values as never).generate(user, estimateId, false);
    const prompt = JSON.stringify(deps.gateway.chat.mock.calls[0]?.[0]);
    expect(prompt).not.toContain('卧室电路 220V需要调整；厨房水路12米需要改造');
    expect(prompt).not.toContain('装修思路 2026版；全屋线路20米需要更换');
    expect(prompt).not.toContain('施工道路8米宽、全屋回路30厘米、厨房管路500毫米、空调风路2公分、燃气气路3㎡、设备油路4m、施工支路6米宽');
    for (const address of addresses) expect(prompt).not.toContain(address);
    expect(prompt).toContain('[已脱敏]');
  });

  test('rejects unsafe AI analysis before persistence', async () => {
    const deps = buildDependencies();
    const piiAnalysis = {
      summary: '联系138 0013 8000确认预算。',
      allocation_advice: [
        '卧室收纳可拨打0376-1234567咨询。', '卧室电路 220V需要调整；厨房水路12米需要改造；全屋线路20米需要更换',
        '装修思路 2026版；卧室电路220，装修思路2026；施工道路8米宽；全屋回路30厘米；厨房管路500毫米；空调风路2公分；燃气气路3㎡；设备油路4m；施工支路6米宽',
      ],
      risk_factors: [
        '人民路88附近量房', '中山街12需要复核', '建设大道12靠近地铁', '梧桐巷8可以上门', '王府弄5安排测量',
        '幸福大道88号3栋可能需要二次量房。',
        '春风小区2号楼需要确认电梯。',
        '固始幸福村6号楼需要确认道路。',
      ],
      onsite_questions: [
        '建设大道12', '人民路88', '中山街12', '梧桐巷8', '王府弄5',
        '王府弄5号的门牌信息是什么？',
        '门牌号66是否准确？',
        '2单元501室是否方便量房？',
      ],
    };
    deps.gateway.chat.mockResolvedValueOnce({
      content: JSON.stringify(piiAnalysis),
      provider: 'deepseek',
      model: 'deepseek-chat',
    });
    const response = await new Service(deps.values as never).generate(
      user,
      estimateId,
      false,
    );
    const publicResponse = JSON.stringify(response);
    expect(response).toEqual({
      estimate: { ...estimateResult, ai_status: 'failed' },
      ai_analysis: null,
    });
    expect(deps.budgetRepository.completeAiAnalysis).not.toHaveBeenCalled();
    expect(deps.budgetRepository.failAiAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'DOUYIN_BUDGET_AI_INVALID_RESPONSE',
      }),
    );
    const failureCall = JSON.stringify(
      deps.budgetRepository.failAiAnalysis.mock.calls[0]?.[0],
    );
    for (const pii of [
      '138 0013 8000', '0376-1234567', '幸福大道88号3栋',
      '建设大道12', '人民路88', '中山街12', '梧桐巷8', '王府弄5',
      '人民路88附近量房', '中山街12需要复核', '建设大道12靠近地铁', '梧桐巷8可以上门', '王府弄5安排测量',
      '春风小区2号楼', '固始幸福村6号楼', '王府弄5号',
      '门牌号66', '2单元501室',
    ]) {
      expect(failureCall).not.toContain(pii);
      expect(publicResponse).not.toContain(pii);
    }
    const gatewayInput = deps.gateway.chat.mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>;
    };
    expect(gatewayInput.messages[0]?.content).toContain('不得输出任何数字、数字词');
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

  test('fail-closes unsafe succeeded state returned to stale workers', async () => {
    const historicalAnalysis: DouyinBudgetAiAnalysis = {
      ...analysis,
      summary: '联系138-0013-8000确认预算。',
      onsite_questions: ['幸福大道88号3栋是否方便量房？'],
    };
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

    const completedDeps = buildDependencies();
    completedDeps.budgetRepository.completeAiAnalysis.mockResolvedValueOnce({
      ...completedDeps.completedRecord,
      ai_analysis: historicalAnalysis,
    });
    await expect(
      new Service(completedDeps.values as never).generate(user, estimateId, false),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: 'DOUYIN_BUDGET_PUBLIC_RESULT_INVALID',
    });

    const failedDeps = buildDependencies();
    failedDeps.gateway.chat.mockRejectedValueOnce(new Error('timeout'));
    failedDeps.budgetRepository.failAiAnalysis.mockResolvedValueOnce({
      ...baseRecord,
      ai_status: 'succeeded',
      ai_analysis: historicalAnalysis,
      ai_provider: 'deepseek',
      ai_model: 'deepseek-chat',
      ai_claimed_at: null,
    } as never);
    await expect(
      new Service(failedDeps.values as never).generate(user, estimateId, false),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: 'DOUYIN_BUDGET_PUBLIC_RESULT_INVALID',
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
