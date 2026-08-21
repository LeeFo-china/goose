import { beforeAll, describe, expect, mock, test } from 'bun:test';
import type { DouyinBudgetAiAnalysis } from '@gooes/domain';
import type { DouyinBudgetAiEstimateRecord } from './douyin-budget-ai';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

let Repository: typeof import('./douyin-budget-ai').DouyinBudgetAiRepository;

beforeAll(async () => {
  ({ DouyinBudgetAiRepository: Repository } = await import(
    './douyin-budget-ai'
  ));
});

type Call = { readonly method: string; readonly args: readonly unknown[] };
type Result = { readonly data: unknown; readonly error: unknown };

function clientWith(results: Result[]) {
  const calls: Call[] = [];
  let resultIndex = 0;
  const client = {
    rpc: mock((name: string, args: Record<string, unknown>) => {
      calls.push({ method: 'rpc', args: [name, args] });
      return Promise.resolve(
        results[resultIndex++] ?? { data: null, error: null },
      );
    }),
  };
  return { client, calls };
}

const tenantId = '11111111-1111-4111-8111-111111111111';
const installationId = '22222222-2222-4222-8222-222222222222';
const estimateId = '44444444-4444-4444-8444-444444444444';
const subjectHash = 'a'.repeat(64);
const claimedAt = '2026-08-21T04:05:06.123456+00:00';
const aiRecord: DouyinBudgetAiEstimateRecord = {
  id: estimateId,
  estimate_no: 'DYYS-20260821-000042',
  tenant_id: tenantId,
  douyin_miniapp_installation_id: installationId,
  subject_hash: subjectHash,
  request_payload: { area: 120 },
  result_payload: {
    id: estimateId,
    estimate_no: 'DYYS-20260821-000042',
    minimum_total: 96_000,
    ai_status: 'pending',
  },
  ai_status: 'pending',
  ai_analysis: null,
  ai_provider: null,
  ai_model: null,
  ai_attempt_count: 1,
  ai_claimed_at: claimedAt,
  expires_at: '2026-09-20T03:04:05.000Z',
};
const aiScope = { estimateId, tenantId, installationId, subjectHash };

describe('DouyinBudgetAiRepository lease commands', () => {
  test('strictly claims a scoped estimate and preserves the database lease timestamp', async () => {
    const { client, calls } = clientWith([{
      data: {
        data: {
          action: 'claimed',
          estimate: aiRecord,
          lease: { attempt_count: 1, claimed_at: claimedAt },
        },
      },
      error: null,
    }]);
    await expect(new Repository(client as never).claimAiAnalysis({
      ...aiScope,
      retry: true,
    })).resolves.toEqual({
      action: 'claimed',
      estimate: aiRecord,
      lease: { attemptCount: 1, claimedAt },
    });
    expect(calls).toEqual([{
      method: 'rpc',
      args: ['claim_douyin_budget_ai_analysis', {
        p_estimate_id: estimateId,
        p_tenant_id: tenantId,
        p_douyin_miniapp_installation_id: installationId,
        p_subject_hash: subjectHash,
        p_retry: true,
      }],
    }]);
  });

  test('accepts a strict saved envelope and rejects forged scope or ambiguous output', async () => {
    const saved = clientWith([{
      data: { data: { action: 'saved', estimate: aiRecord } },
      error: null,
    }]);
    await expect(new Repository(saved.client as never).claimAiAnalysis({
      ...aiScope,
      retry: false,
    })).resolves.toEqual({ action: 'saved', estimate: aiRecord });

    for (const data of [
      {
        data: {
          action: 'saved',
          estimate: { ...aiRecord, subject_hash: 'b'.repeat(64) },
        },
      },
      {
        data: {
          action: 'claimed',
          estimate: aiRecord,
          lease: { attempt_count: 2, claimed_at: claimedAt },
        },
      },
      {
        data: { action: 'saved', estimate: aiRecord },
        error: { status_code: 404, code: 'DOUYIN_BUDGET_ESTIMATE_NOT_FOUND' },
      },
    ]) {
      const { client } = clientWith([{ data, error: null }]);
      await expect(new Repository(client as never).claimAiAnalysis({
        ...aiScope,
        retry: false,
      })).rejects.toMatchObject({
        statusCode: 500,
        code: 'DOUYIN_BUDGET_REPOSITORY_RESPONSE_INVALID',
      });
    }
  });

  test('maps only stable not-found and expired claim errors', async () => {
    for (const [error, expected] of [
      [
        { status_code: 404, code: 'DOUYIN_BUDGET_ESTIMATE_NOT_FOUND' },
        { statusCode: 404, code: 'DOUYIN_BUDGET_ESTIMATE_NOT_FOUND' },
      ],
      [
        { status_code: 410, code: 'DOUYIN_BUDGET_ESTIMATE_EXPIRED' },
        { statusCode: 410, code: 'DOUYIN_BUDGET_ESTIMATE_EXPIRED' },
      ],
    ] as const) {
      const { client } = clientWith([{ data: { error }, error: null }]);
      await expect(new Repository(client as never).claimAiAnalysis({
        ...aiScope,
        retry: false,
      })).rejects.toMatchObject(expected);
    }
  });

  test('completes and fails only the exact opaque lease', async () => {
    const succeededAnalysis: DouyinBudgetAiAnalysis = {
      summary: 'ok',
      allocation_advice: [],
      risk_factors: [],
      onsite_questions: [],
    };
    const succeededRecord: DouyinBudgetAiEstimateRecord = {
      ...aiRecord,
      ai_status: 'succeeded',
      ai_analysis: succeededAnalysis,
      ai_provider: 'deepseek',
      ai_model: 'deepseek-chat',
      ai_claimed_at: null,
    };
    const complete = clientWith([{
      data: { data: { estimate: succeededRecord } },
      error: null,
    }]);
    await expect(new Repository(complete.client as never).completeAiAnalysis({
      ...aiScope,
      lease: { attemptCount: 1, claimedAt },
      analysis: succeededAnalysis,
      provider: 'deepseek',
      model: 'deepseek-chat',
    })).resolves.toEqual(succeededRecord);
    expect(complete.calls).toEqual([{
      method: 'rpc',
      args: ['complete_douyin_budget_ai_analysis', {
        p_estimate_id: estimateId,
        p_tenant_id: tenantId,
        p_douyin_miniapp_installation_id: installationId,
        p_subject_hash: subjectHash,
        p_attempt_count: 1,
        p_claimed_at: claimedAt,
        p_ai_analysis: succeededAnalysis,
        p_ai_provider: 'deepseek',
        p_ai_model: 'deepseek-chat',
      }],
    }]);

    const failedRecord: DouyinBudgetAiEstimateRecord = {
      ...aiRecord,
      ai_status: 'failed',
      ai_claimed_at: null,
    };
    const failed = clientWith([{
      data: { data: { estimate: failedRecord } },
      error: null,
    }]);
    await expect(new Repository(failed.client as never).failAiAnalysis({
      ...aiScope,
      lease: { attemptCount: 1, claimedAt },
      errorCode: 'DOUYIN_BUDGET_AI_GATEWAY_FAILED',
    })).resolves.toEqual(failedRecord);
    expect(failed.calls).toEqual([{
      method: 'rpc',
      args: ['fail_douyin_budget_ai_analysis', {
        p_estimate_id: estimateId,
        p_tenant_id: tenantId,
        p_douyin_miniapp_installation_id: installationId,
        p_subject_hash: subjectHash,
        p_attempt_count: 1,
        p_claimed_at: claimedAt,
        p_error_code: 'DOUYIN_BUDGET_AI_GATEWAY_FAILED',
      }],
    }]);
  });

  test('wraps AI command transport failures without raw database details', async () => {
    const sensitive = 'claim SQL failed at 192.0.2.10';
    const { client } = clientWith([{
      data: null,
      error: { code: 'P0001', message: sensitive, details: sensitive },
    }]);
    let caught: unknown;
    try {
      await new Repository(client as never).claimAiAnalysis({
        ...aiScope,
        retry: false,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      statusCode: 500,
      code: 'DOUYIN_BUDGET_REPOSITORY_ERROR',
    });
    expect(JSON.stringify(caught)).not.toContain(sensitive);
  });
});
