import { beforeAll, describe, expect, test } from 'bun:test';
import type { DouyinBudgetAiAnalysis } from '@gooes/domain';

import {
  analysis,
  baseRecord,
  buildDependencies,
  estimateId,
  estimateResult,
  selection,
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
  test('omits every request and result free-text field from the prompt', async () => {
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
    expect(prompt).not.toContain('[已脱敏]');
    for (const resultText of [
      '基础施工', '定制', '人民路八十八号',
      '幸福小区三号楼二单元五〇一室',
      '厨房水路十二米需要改造', '家电', '软装',
      '初步估算，不构成最终报价',
    ]) expect(prompt).not.toContain(resultText);
    expect(prompt).toContain('rules_estimate_overview');
    expect(prompt).toContain('prioritize_core_work');
    for (const templateText of [
      analysis.summary,
      ...analysis.allocation_advice,
      ...analysis.risk_factors,
      ...analysis.onsite_questions,
    ]) expect(prompt).not.toContain(templateText);
    expect(response.ai_analysis).toEqual(analysis);
  });

  test('rejects free text, unknown codes, duplicates and extra fields', async () => {
    const invalidSelections = [
      analysis,
      { ...selection, summary_code: '联系13800138000追加999万元' },
      { ...selection, summary_code: 'unknown_summary' },
      { ...selection, extra: '联系13800138000' },
      { ...selection, allocation_advice_codes: [] },
      {
        ...selection,
        risk_factor_codes: ['site_conditions', 'site_conditions'],
      },
      {
        ...selection,
        onsite_question_codes: ['verify_structure', '幸福小区'],
      },
    ];
    let systemPrompt: string | undefined;
    for (const invalidSelection of invalidSelections) {
      const deps = buildDependencies();
      deps.gateway.chat.mockResolvedValueOnce({
        content: JSON.stringify(invalidSelection),
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
    expect(systemPrompt).toContain('只能返回允许的选择代码');
  });

  test('maps a legal selection to exact static templates before completion', async () => {
    const deps = buildDependencies();
    deps.gateway.chat.mockResolvedValueOnce({
      content: JSON.stringify(selection),
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
    expect(response.ai_analysis).toEqual(analysis);
    expect(deps.budgetRepository.completeAiAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ analysis }),
    );
    expect(deps.budgetRepository.completeAiAnalysis).toHaveBeenCalledTimes(1);
    expect(deps.budgetRepository.failAiAnalysis).not.toHaveBeenCalled();
  });

  test('returns only exact historical templates and rejects every other string', async () => {
    const safeDeps = buildDependencies();
    safeDeps.budgetRepository.claimAiAnalysis.mockResolvedValueOnce({
      action: 'saved',
      estimate: { ...safeDeps.completedRecord, ai_analysis: analysis },
    } as never);
    await expect(
      new Service(safeDeps.values as never).generate(user, estimateId, false),
    ).resolves.toMatchObject({ ai_analysis: analysis });

    const invalidHistorical = [
      {
        ...analysis,
        summary: '安全但不在模板中的自由文本。',
      },
      {
        ...analysis,
        allocation_advice: [
          '建议优先确认基础施工与隐蔽工程范围。',
          '建议优先确认基础施工与隐蔽工程范围。',
        ],
      },
      {
        ...analysis,
        onsite_questions: ['联系13800138000追加999万元。'],
      },
    ];
    for (const [index, invalidAnalysis] of invalidHistorical.entries()) {
      const deps = buildDependencies();
      deps.budgetRepository.claimAiAnalysis.mockResolvedValueOnce({
        action: 'saved',
        estimate: {
          ...baseRecord,
          ai_status: 'succeeded',
          ai_analysis: invalidAnalysis,
          ai_provider: 'deepseek',
          ai_model: 'deepseek-chat',
          ai_attempt_count: index + 1,
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
