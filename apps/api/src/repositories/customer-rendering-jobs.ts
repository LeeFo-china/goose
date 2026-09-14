import { z } from 'zod';
import { Errors } from '@/errors/error-factory';
import { SupabaseDB } from '@/utils/supabase';
import type { CustomerRenderingQuotaIdentity, CustomerRenderingPhoneIdentity } from './customer-rendering-quota';

export type CreateCustomerRenderingJob = CustomerRenderingQuotaIdentity & CustomerRenderingPhoneIdentity & {
  styleAssetId: string; roomFileId: string; floorPlanFileId: string | null;
  space: 'living_room' | 'bedroom'; mode: 'soft_furnishing' | 'renovation';
  keepNotes: string | null; idempotencyKey: string; requestHash: string;
};

const Quota = z.object({ account_id: z.uuid(), phone_verified: z.boolean(),
  consumed: z.number().int().nonnegative(), reserved: z.number().int().nonnegative(),
  active_job_id: z.uuid().nullable(), reservation_status: z.enum(['reserved', 'consumed', 'released']).nullable(),
});
const Result = z.discriminatedUnion('decision', [
  z.object({ decision: z.enum(['created', 'existing']), job_id: z.uuid(),
    status: z.enum(['queued', 'processing', 'succeeded', 'failed', 'review_required']), quota: Quota }),
  z.object({ decision: z.enum(['disabled', 'invalid_request', 'style_unavailable', 'input_unavailable',
    'daily_task_limit', 'daily_budget_limit', 'job_active', 'phone_required',
    'quota_exhausted', 'idempotency_conflict']) }),
]);
export type CustomerRenderingJobAdmissionResult = z.infer<typeof Result>;
export interface CustomerRenderingJobsRepositoryPort {
  create(command: CreateCustomerRenderingJob): Promise<CustomerRenderingJobAdmissionResult>;
}
type RpcClient = { rpc(name: string, params: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };

export class CustomerRenderingJobsRepository implements CustomerRenderingJobsRepositoryPort {
  constructor(private readonly configuredClient?: RpcClient) {}

  async create(command: CreateCustomerRenderingJob): Promise<CustomerRenderingJobAdmissionResult> {
    const client = this.configuredClient ?? SupabaseDB.getAdminClient() as unknown as RpcClient;
    let result: { data: unknown; error: unknown };
    try {
      result = await client.rpc('create_customer_rendering_job', {
        p_tenant_id: command.tenantId, p_channel: command.channel,
        p_subject_key_version: command.subjectKeyVersion, p_subject_digest: command.subjectDigest,
        p_application_id: command.applicationId, p_installation_id: command.installationId,
        p_phone_key_version: command.phoneKeyVersion, p_phone_digest: command.phoneDigest,
        p_style_asset_id: command.styleAssetId, p_room_file_id: command.roomFileId,
        p_floor_plan_file_id: command.floorPlanFileId, p_space: command.space,
        p_mode: command.mode, p_keep_notes: command.keepNotes,
        p_idempotency_key: command.idempotencyKey, p_request_hash: command.requestHash,
      });
    } catch { throw Errors.dbError('创建客户生图任务失败'); }
    if (result.error) throw Errors.dbError('创建客户生图任务失败');
    const parsed = Result.safeParse(result.data);
    if (!parsed.success) throw Errors.dbError('客户生图任务准入响应无效');
    return parsed.data;
  }
}

export const customerRenderingJobsRepository = new CustomerRenderingJobsRepository();
