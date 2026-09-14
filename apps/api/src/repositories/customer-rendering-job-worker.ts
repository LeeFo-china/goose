import { z } from 'zod';
import { Errors } from '@/errors/error-factory';
import { SupabaseDB } from '@/utils/supabase';

const Uuid = z.uuid();
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const Location = z.object({ bucket: z.string().min(1), region: z.string().min(1), object_key: z.string().min(1) });
const Image = Location.extend({ size_bytes: z.number().int().positive().max(10 * 1024 * 1024), sha256: Sha256 });
const Claim = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('empty') }),
  z.object({ decision: z.literal('invalid_request') }),
  z.object({ decision: z.literal('claimed'), job_id: Uuid, attempt_id: Uuid, tenant_id: Uuid,
    style_asset_id: Uuid,
    space: z.enum(['living_room', 'bedroom']), mode: z.enum(['soft_furnishing', 'renovation']),
    keep_notes: z.string().nullable(),
    room: Image.extend({ file_id: Uuid }),
    style_snapshot: Location.extend({ file_id: Uuid, checksum: Sha256,
      size_bytes: z.number().int().positive().max(10 * 1024 * 1024),
      title: z.string(), space: z.enum(['living_room', 'bedroom']),
      style: z.string(), color_notes: z.string(), material_notes: z.string(),
      source_type: z.string(), published_version: z.number().int().positive(),
      published_at: z.string() }),
  }),
]);
const Submitted = z.object({ decision: z.enum(['submitted', 'stale', 'invalid_request']) });
const Recorded = z.object({ decision: z.enum(['recorded', 'stale', 'invalid_request']) });
const ReviewRequired = z.object({ decision: z.enum(['review_required', 'stale', 'invalid_request']) });
const OutputReviewRecorded = z.object({ decision: z.enum(['recorded', 'stale', 'invalid_request']) });
const Finalized = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('finalized'), status: z.enum(['succeeded', 'failed']) }),
  z.object({ decision: z.enum(['stale', 'invalid_request', 'invalid_state']) }),
]);
export type ClaimedCustomerRenderingJob = Extract<z.infer<typeof Claim>, { decision: 'claimed' }>;
export type CustomerRenderingJobResultFact = {
  location: { bucket: string; region: string; object_key: string };
  sizeBytes: number; sha256: string; providerRequestId: string | null;
};
export interface CustomerRenderingJobWorkerRepositoryPort {
  claim(): Promise<z.infer<typeof Claim>>;
  markSubmitted(jobId: string, attemptId: string, modelCode: string): Promise<z.infer<typeof Submitted>['decision']>;
  recordResult(jobId: string, attemptId: string, result: CustomerRenderingJobResultFact): Promise<z.infer<typeof Recorded>['decision']>;
  markReviewRequired(jobId: string, attemptId: string, failureCode: string): Promise<z.infer<typeof ReviewRequired>['decision']>;
  recordOutputReview(jobId: string, attemptId: string, review: { decision: 'approved' | 'rejected' | 'manual'; providerRequestId: string | null; rawResult: number | null }): Promise<z.infer<typeof OutputReviewRecorded>['decision']>;
  finalize(jobId: string, attemptId: string, outcome: 'approved' | 'rejected' | 'failed' | 'provider_rejected', failureCode: string | null): Promise<z.infer<typeof Finalized>>;
  reconcileExpired(): Promise<number>;
}
type RpcClient = { rpc(name: string, params: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };

export class CustomerRenderingJobWorkerRepository implements CustomerRenderingJobWorkerRepositoryPort {
  constructor(private readonly configuredClient?: RpcClient) {}

  private async call<T>(name: string, params: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    const client = this.configuredClient ?? SupabaseDB.getAdminClient() as unknown as RpcClient;
    let result: { data: unknown; error: unknown };
    try { result = await client.rpc(name, params); }
    catch { throw Errors.dbError('客户生图任务状态更新失败'); }
    if (result.error) throw Errors.dbError('客户生图任务状态更新失败');
    const parsed = schema.safeParse(result.data);
    if (!parsed.success) throw Errors.dbError('客户生图任务状态响应无效');
    return parsed.data;
  }

  claim(): Promise<z.infer<typeof Claim>> {
    return this.call('claim_customer_rendering_job', { p_lease_seconds: 900 }, Claim);
  }
  async markSubmitted(jobId: string, attemptId: string, modelCode: string): Promise<z.infer<typeof Submitted>['decision']> {
    const result = await this.call('mark_customer_rendering_job_submitted',
      { p_job_id: jobId, p_attempt_id: attemptId, p_model_code: modelCode }, Submitted);
    return result.decision;
  }
  async recordResult(jobId: string, attemptId: string, result: CustomerRenderingJobResultFact): Promise<z.infer<typeof Recorded>['decision']> {
    const response = await this.call('record_customer_rendering_job_result', {
      p_job_id: jobId, p_attempt_id: attemptId, p_provider_request_id: result.providerRequestId,
      p_bucket: result.location.bucket, p_region: result.location.region,
      p_object_key: result.location.object_key, p_sha256: result.sha256,
      p_size_bytes: result.sizeBytes,
    }, Recorded);
    return response.decision;
  }
  async markReviewRequired(jobId: string, attemptId: string, failureCode: string): Promise<z.infer<typeof ReviewRequired>['decision']> {
    const result = await this.call('mark_customer_rendering_job_review_required',
      { p_job_id: jobId, p_attempt_id: attemptId, p_failure_code: failureCode }, ReviewRequired);
    return result.decision;
  }
  async recordOutputReview(jobId: string, attemptId: string,
    review: { decision: 'approved' | 'rejected' | 'manual'; providerRequestId: string | null; rawResult: number | null },
  ): Promise<z.infer<typeof OutputReviewRecorded>['decision']> {
    const result = await this.call('record_customer_rendering_job_output_review', {
      p_job_id: jobId, p_attempt_id: attemptId, p_decision: review.decision,
      p_request_id: review.providerRequestId, p_raw_result: review.rawResult,
    }, OutputReviewRecorded);
    return result.decision;
  }
  finalize(jobId: string, attemptId: string, outcome: 'approved' | 'rejected' | 'failed' | 'provider_rejected', failureCode: string | null): Promise<z.infer<typeof Finalized>> {
    return this.call('finalize_customer_rendering_job',
      { p_job_id: jobId, p_attempt_id: attemptId, p_outcome: outcome, p_failure_code: failureCode }, Finalized);
  }
  reconcileExpired(): Promise<number> {
    return this.call('reconcile_expired_customer_rendering_jobs', { p_limit: 25 }, z.number().int().min(0).max(25));
  }
}

export const customerRenderingJobWorkerRepository = new CustomerRenderingJobWorkerRepository();
