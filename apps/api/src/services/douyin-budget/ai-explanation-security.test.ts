import { beforeAll, describe, expect, test } from 'bun:test';
import type { DouyinBudgetAiAnalysis } from '@gooes/domain';

import {
  analysis,
  baseRecord,
  buildDependencies,
  estimateId,
  estimateResult,
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

describe('DouyinBudgetAiExplanationService security boundaries', () => {
  test('omits every user free-text field and sanitizes controlled result text', async () => {
    const deps = buildDependencies();
    const layout = '自由布局：联系１３８　００１３　８０００';
    const style = '自由风格：联系138​0013⁠8000';
    const demand = [
      '自由需求', '联系１三８​〇〇1３８0００',
      '人民路八十八号', '幸福小区三号楼二单元五〇一室',
    ].join('；');
    deps.budgetRepository.claimAiAnalysis.mockResolvedValueOnce({
      ...deps.claimed,
      estimate: {
        ...baseRecord,
        request_payload: {
          ...baseRecord.request_payload as object,
          layout,
          style,
          demand,
        },
        result_payload: {
          ...estimateResult,
          categories: estimateResult.categories.map((category, index) => ({
            ...category,
            label: index === 0 ? '联系１三８​〇〇1３８0００' : category.label,
          })),
          calculation_basis: [
            '人民路八十八号',
            '幸福小区三号楼二单元五〇一室',
          ],
          included_items: ['厨房水路十二米需要改造'],
        },
      },
    });

    const response = await new Service(deps.values as never).generate(
      user,
      estimateId,
      false,
    );
    const gatewayInput = deps.gateway.chat.mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>;
    };
    const userPrompt = JSON.parse(gatewayInput.messages[1]?.content ?? '{}') as {
      request: Record<string, unknown>;
    };
    const prompt = JSON.stringify(userPrompt);
    expect(userPrompt.request).toEqual({
      area: 100,
      property_condition: 'rough',
      decoration_tier: 'comfortable',
      decoration_scope: 'whole_house',
      option_codes: ['custom_cabinet'],
    });
    expect(prompt).not.toContain('layout');
    expect(prompt).not.toContain('style');
    expect(prompt).not.toContain('demand');
    for (const freeText of [layout, style, demand]) {
      expect(prompt).not.toContain(freeText);
    }
    for (const pii of [
      '１３８　００１３　８０００',
      '138​0013⁠8000', '１三８​〇〇1３８0００',
      '人民路八十八号', '幸福小区三号楼二单元五〇一室',
    ]) expect(prompt).not.toContain(pii);
    expect(prompt).toContain('[已脱敏]');
    expect(response.ai_analysis).toEqual(analysis);
  });

  test('fails one logical attempt for any numeric or high-risk AI text', async () => {
    const unsafeExpressions = [
      '建议新增硬装预算999万元',
      '建议确认第2项',
      '建议确认第２项',
      '建议确认第Ⅳ项',
      '建议确认幺号区域',
      '建议确认兩处墙面',
      '建议确认壹处节点',
      '联系138​0013⁠8000确认',
      '邮箱 contact@example.com',
      '微信号 abcdef',
      '幸福小区',
    ];
    let systemPrompt: string | undefined;
    for (const [index, expression] of unsafeExpressions.entries()) {
      const deps = buildDependencies();
      const unsafeAnalysis: DouyinBudgetAiAnalysis = index % 4 === 0
        ? { ...analysis, summary: expression }
        : index % 4 === 1
          ? { ...analysis, allocation_advice: [expression] }
          : index % 4 === 2
            ? { ...analysis, risk_factors: [expression] }
            : { ...analysis, onsite_questions: [expression] };
      deps.gateway.chat.mockResolvedValueOnce({
        content: JSON.stringify(unsafeAnalysis),
        provider: 'deepseek',
        model: 'deepseek-chat',
      });
      const response = await new Service(deps.values as never).generate(
        user,
        estimateId,
        false,
      );
      const gatewayInput = deps.gateway.chat.mock.calls[0]?.[0] as {
        messages: Array<{ content: string }>;
      };
      systemPrompt ??= gatewayInput.messages[0]?.content;
      expect(response).toEqual({
        estimate: { ...estimateResult, ai_status: 'failed' },
        ai_analysis: null,
      });
      expect(deps.budgetRepository.completeAiAnalysis).not.toHaveBeenCalled();
      expect(deps.budgetRepository.failAiAnalysis).toHaveBeenCalledTimes(1);
      expect(deps.budgetRepository.failAiAnalysis).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: 'DOUYIN_BUDGET_AI_INVALID_RESPONSE',
        }),
      );
    }
    expect(systemPrompt).toContain('不得输出任何数字、数字词、金额');
    expect(systemPrompt).toContain('联系方式或详细地址');
  });

  test('accepts safe AI text without numeric or identity markers', async () => {
    const deps = buildDependencies();
    const safeAnalysis: DouyinBudgetAiAnalysis = {
      ...analysis,
      summary: '规则​解释，保持克制。',
      risk_factors: ['风险因素：墙体现状待核实。'],
    };
    deps.gateway.chat.mockResolvedValueOnce({
      content: JSON.stringify(safeAnalysis),
      provider: 'deepseek',
      model: 'deepseek-chat',
    });
    deps.budgetRepository.completeAiAnalysis.mockImplementationOnce(
      async (input: unknown) => ({
        ...deps.completedRecord,
        ai_analysis: (input as { analysis: DouyinBudgetAiAnalysis }).analysis,
      }),
    );
    const response = await new Service(deps.values as never).generate(
      user,
      estimateId,
      false,
    );
    expect(response.ai_analysis).toEqual({
      ...safeAnalysis,
      summary: '规则解释,保持克制。',
      risk_factors: ['风险因素:墙体现状待核实。'],
    });
    expect(deps.budgetRepository.completeAiAnalysis).toHaveBeenCalledTimes(1);
    expect(deps.budgetRepository.failAiAnalysis).not.toHaveBeenCalled();
  });

  test('fail-closes saved and stale succeeded unsafe analysis', async () => {
    for (const attemptCount of [1, 2]) {
      const deps = buildDependencies();
      deps.budgetRepository.claimAiAnalysis.mockResolvedValueOnce({
        action: 'saved',
        estimate: {
          ...baseRecord,
          ai_status: 'succeeded',
          ai_analysis: {
            ...analysis,
            summary: attemptCount === 1
              ? '建议确认第2项'
              : '幸福小区',
          },
          ai_provider: 'deepseek',
          ai_model: 'deepseek-chat',
          ai_attempt_count: attemptCount,
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
    }
  });
});
