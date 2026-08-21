import {
  DOUYIN_BUDGET_AI_STATUS_VALUES,
  type DouyinBudgetAiAnalysis,
} from '@gooes/domain';
import { z } from 'zod';

import { AppError } from '@/errors/app-error';
import { Errors } from '@/errors/error-factory';
import type { Database } from '@/types/database';
import { SupabaseDB } from '@/utils/supabase';

const DatabaseDateTimeSchema = z.iso.datetime({ offset: true });
const SubjectHashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const AiEstimateRecordSchema = z.strictObject({
  id: z.uuid(),
  estimate_no: z.string().regex(/^DYYS-\d{8}-\d{6}$/),
  tenant_id: z.uuid(),
  douyin_miniapp_installation_id: z.uuid(),
  subject_hash: SubjectHashSchema,
  request_payload: z.unknown(),
  result_payload: z.unknown(),
  ai_status: z.enum(DOUYIN_BUDGET_AI_STATUS_VALUES),
  ai_analysis: z.unknown().nullable(),
  ai_provider: z.string().trim().min(1).max(100).nullable(),
  ai_model: z.string().trim().min(1).max(100).nullable(),
  ai_attempt_count: z.int().min(0).max(3),
  ai_claimed_at: DatabaseDateTimeSchema.nullable(),
  expires_at: DatabaseDateTimeSchema,
});
const AiLeaseSchema = z.strictObject({
  attempt_count: z.int().min(1).max(3),
  claimed_at: DatabaseDateTimeSchema,
});
const AiClaimEnvelopeSchema = z.union([
  z.strictObject({
    data: z.strictObject({
      action: z.literal('claimed'),
      estimate: AiEstimateRecordSchema,
      lease: AiLeaseSchema,
    }),
  }),
  z.strictObject({
    data: z.strictObject({
      action: z.literal('saved'),
      estimate: AiEstimateRecordSchema,
    }),
  }),
  z.strictObject({ error: aiCommandErrorSchema() }),
]);
const AiMutationEnvelopeSchema = z.union([
  z.strictObject({
    data: z.strictObject({ estimate: AiEstimateRecordSchema }),
  }),
  z.strictObject({ error: aiCommandErrorSchema() }),
]);

type AiRpcName =
  | 'claim_douyin_budget_ai_analysis'
  | 'complete_douyin_budget_ai_analysis'
  | 'fail_douyin_budget_ai_analysis';
type AiRpcArgs<Name extends AiRpcName> =
  Database['public']['Functions'][Name]['Args'];

export interface DouyinBudgetAiDatabaseResult {
  readonly data: unknown;
  readonly error: unknown;
}

export interface DouyinBudgetAiDatabaseClient {
  rpc<Name extends AiRpcName>(
    name: Name,
    args: AiRpcArgs<Name>,
  ): PromiseLike<DouyinBudgetAiDatabaseResult>;
}

export type DouyinBudgetAiEstimateRecord = z.infer<
  typeof AiEstimateRecordSchema
>;
export type DouyinBudgetAiLease = {
  readonly attemptCount: number;
  readonly claimedAt: string;
};
export type DouyinBudgetAiClaimResult =
  | {
      readonly action: 'claimed';
      readonly estimate: DouyinBudgetAiEstimateRecord;
      readonly lease: DouyinBudgetAiLease;
    }
  | {
      readonly action: 'saved';
      readonly estimate: DouyinBudgetAiEstimateRecord;
    };
export type DouyinBudgetAiScope = {
  readonly estimateId: string;
  readonly tenantId: string;
  readonly installationId: string;
  readonly subjectHash: string;
};

export class DouyinBudgetAiRepository {
  constructor(
    private readonly client: DouyinBudgetAiDatabaseClient =
      SupabaseDB.getAdminClient() as unknown as DouyinBudgetAiDatabaseClient,
  ) {}

  async claimAiAnalysis(
    input: DouyinBudgetAiScope & { readonly retry: boolean },
  ): Promise<DouyinBudgetAiClaimResult> {
    return execute(async () => {
      const result = await this.client.rpc('claim_douyin_budget_ai_analysis', {
        p_estimate_id: input.estimateId,
        p_tenant_id: input.tenantId,
        p_douyin_miniapp_installation_id: input.installationId,
        p_subject_hash: input.subjectHash,
        p_retry: input.retry,
      });
      assertDatabaseSuccess(result);
      const parsed = AiClaimEnvelopeSchema.safeParse(result.data);
      if (!parsed.success) throw responseInvalid();
      if ('error' in parsed.data) throw commandError(parsed.data.error);
      assertScope(parsed.data.data.estimate, input);
      if (parsed.data.data.action === 'saved') return parsed.data.data;
      const { estimate, lease } = parsed.data.data;
      if (
        estimate.ai_status !== 'pending'
        || estimate.ai_attempt_count !== lease.attempt_count
        || estimate.ai_claimed_at !== lease.claimed_at
      ) {
        throw responseInvalid();
      }
      return {
        action: 'claimed' as const,
        estimate,
        lease: {
          attemptCount: lease.attempt_count,
          claimedAt: lease.claimed_at,
        },
      };
    });
  }

  async completeAiAnalysis(
    input: DouyinBudgetAiScope & {
      readonly lease: DouyinBudgetAiLease;
      readonly analysis: DouyinBudgetAiAnalysis;
      readonly provider: string;
      readonly model: string;
    },
  ): Promise<DouyinBudgetAiEstimateRecord> {
    return this.mutate('complete_douyin_budget_ai_analysis', {
      p_estimate_id: input.estimateId,
      p_tenant_id: input.tenantId,
      p_douyin_miniapp_installation_id: input.installationId,
      p_subject_hash: input.subjectHash,
      p_attempt_count: input.lease.attemptCount,
      p_claimed_at: input.lease.claimedAt,
      p_ai_analysis: input.analysis,
      p_ai_provider: input.provider,
      p_ai_model: input.model,
    }, input);
  }

  async failAiAnalysis(
    input: DouyinBudgetAiScope & {
      readonly lease: DouyinBudgetAiLease;
      readonly errorCode: string;
    },
  ): Promise<DouyinBudgetAiEstimateRecord> {
    return this.mutate('fail_douyin_budget_ai_analysis', {
      p_estimate_id: input.estimateId,
      p_tenant_id: input.tenantId,
      p_douyin_miniapp_installation_id: input.installationId,
      p_subject_hash: input.subjectHash,
      p_attempt_count: input.lease.attemptCount,
      p_claimed_at: input.lease.claimedAt,
      p_error_code: input.errorCode,
    }, input);
  }

  private async mutate<Name extends Exclude<AiRpcName, 'claim_douyin_budget_ai_analysis'>>(
    name: Name,
    args: AiRpcArgs<Name>,
    scope: DouyinBudgetAiScope,
  ): Promise<DouyinBudgetAiEstimateRecord> {
    return execute(async () => {
      const result = await this.client.rpc(name, args);
      assertDatabaseSuccess(result);
      const parsed = AiMutationEnvelopeSchema.safeParse(result.data);
      if (!parsed.success) throw responseInvalid();
      if ('error' in parsed.data) throw commandError(parsed.data.error);
      assertScope(parsed.data.data.estimate, scope);
      return parsed.data.data.estimate;
    });
  }
}

function aiCommandErrorSchema() {
  return z.discriminatedUnion('code', [
    z.strictObject({
      status_code: z.literal(404),
      code: z.literal('DOUYIN_BUDGET_ESTIMATE_NOT_FOUND'),
    }),
    z.strictObject({
      status_code: z.literal(410),
      code: z.literal('DOUYIN_BUDGET_ESTIMATE_EXPIRED'),
    }),
    z.strictObject({
      status_code: z.literal(500),
      code: z.literal('DOUYIN_BUDGET_AI_COMMAND_INVALID'),
    }),
  ]);
}

function assertScope(
  record: DouyinBudgetAiEstimateRecord,
  scope: DouyinBudgetAiScope,
): void {
  if (
    record.id !== scope.estimateId
    || record.tenant_id !== scope.tenantId
    || record.douyin_miniapp_installation_id !== scope.installationId
    || record.subject_hash !== scope.subjectHash
  ) {
    throw responseInvalid();
  }
}

function assertDatabaseSuccess(result: DouyinBudgetAiDatabaseResult): void {
  if (result.error) throw repositoryError();
}

function commandError(error: {
  readonly status_code: 404 | 410 | 500;
  readonly code:
    | 'DOUYIN_BUDGET_ESTIMATE_NOT_FOUND'
    | 'DOUYIN_BUDGET_ESTIMATE_EXPIRED'
    | 'DOUYIN_BUDGET_AI_COMMAND_INVALID';
}) {
  const messages = {
    DOUYIN_BUDGET_ESTIMATE_NOT_FOUND: '预算不存在',
    DOUYIN_BUDGET_ESTIMATE_EXPIRED: '预算已过期',
    DOUYIN_BUDGET_AI_COMMAND_INVALID: '预算 AI 状态更新失败',
  } as const;
  return Errors.business(error.status_code, messages[error.code], error.code);
}

async function execute<Result>(operation: () => Promise<Result>): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw repositoryError();
  }
}

function repositoryError() {
  return Errors.business(
    500,
    '预算数据操作失败',
    'DOUYIN_BUDGET_REPOSITORY_ERROR',
  );
}

function responseInvalid() {
  return Errors.business(
    500,
    '预算数据响应无效',
    'DOUYIN_BUDGET_REPOSITORY_RESPONSE_INVALID',
  );
}

export const douyinBudgetAiRepository = new DouyinBudgetAiRepository();
