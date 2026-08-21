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
  test('normalizes Unicode before redacting prompt and AI output PII', async () => {
    const deps = buildDependencies();
    const unicodeOutput: DouyinBudgetAiAnalysis = {
      summary: '联系１３８　００１３　８０００确认。',
      allocation_advice: ['联系138​0013⁠8000确认。'],
      risk_factors: ['人民路八十八号需要复核。'],
      onsite_questions: ['联系１三８​〇〇1３８0００确认。'],
    };
    deps.budgetRepository.claimAiAnalysis.mockResolvedValueOnce({
      ...deps.claimed,
      estimate: {
        ...baseRecord,
        request_payload: {
          ...baseRecord.request_payload as object,
          layout: '现代​简约',
          style: '联系１３８　００１３　８０００',
          demand: '联系138​0013⁠8000，厨房水路十二米需要改造',
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
    deps.gateway.chat.mockResolvedValueOnce({
      content: JSON.stringify(unicodeOutput),
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
    const prompt = JSON.stringify(deps.gateway.chat.mock.calls[0]?.[0]);
    const persisted = JSON.stringify(
      deps.budgetRepository.completeAiAnalysis.mock.calls[0]?.[0],
    );
    const publicResponse = JSON.stringify(response);
    expect(prompt).toContain('现代简约');
    expect(prompt).toContain('厨房水路十二米需要改造');
    for (const pii of [
      '１３８　００１３　８０００', '138 0013 8000',
      '138​0013⁠8000', '13800138000',
      '１三８​〇〇1３８0００', '一三八〇〇一三八〇〇〇',
      '人民路八十八号', '人民路088号',
      '幸福小区三号楼二单元五〇一室',
      '幸福小区3号楼2单元501室',
    ]) {
      expect(prompt).not.toContain(pii);
      expect(persisted).not.toContain(pii);
      expect(publicResponse).not.toContain(pii);
    }
    expect(persisted).toContain('[已脱敏]');
    expect(publicResponse).toContain('[已脱敏]');
  });

  test('fails one logical attempt for every generated monetary expression', async () => {
    const monetaryExpressions = [
      '建议新增硬装预算999万元',
      '预算人民币九百元',
      '单价￥９９９',
      '材料费 RMB 999',
      '人工费 999 CNY',
      '追加三千块',
      '预留20万',
      '建议硬装预算999',
      '主材单价九百',
    ];
    let systemPrompt: string | undefined;
    for (const expression of monetaryExpressions) {
      const deps = buildDependencies();
      deps.gateway.chat.mockResolvedValueOnce({
        content: JSON.stringify({ ...analysis, summary: expression }),
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
    expect(systemPrompt).toContain('不得输出任何金额、单价、预算数字');
  });

  test('fail-closes saved and stale succeeded analysis containing money', async () => {
    for (const attemptCount of [1, 2]) {
      const deps = buildDependencies();
      deps.budgetRepository.claimAiAnalysis.mockResolvedValueOnce({
        action: 'saved',
        estimate: {
          ...baseRecord,
          ai_status: 'succeeded',
          ai_analysis: {
            ...analysis,
            summary: '建议新增硬装预算999万元',
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
