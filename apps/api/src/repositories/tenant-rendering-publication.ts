import { z } from 'zod';
import { RENDERING_UPLOAD_MAX_BYTES } from '@gooes/domain';
import { Errors } from '@/errors/error-factory';
import { SupabaseDB } from '@/utils/supabase';

export type TenantRenderingPublicationDatabaseClient = Pick<ReturnType<typeof SupabaseDB.getAdminClient>, 'rpc'>;
export interface BeginPublicationInput {
  tenantId: string; styleId: string; expectedVersion: number;
  idempotencyKey: string; requestHash: string; leaseToken: string;
}
export interface CompletePublicationInput {
  tenantId: string; commandId: string; leaseToken: string; publicUrl: string; employeeId: string;
}
export interface FailPublicationInput {
  tenantId: string; commandId: string; leaseToken: string;
  failureCode: 'copy_failed' | 'storage_unavailable' | 'commit_failed' | 'not_publishable' | 'version_conflict';
}

const LocationSchema = z.strictObject({
  bucket: z.string().min(1), region: z.string().min(1), object_key: z.string().min(1),
});
const SucceededSchema = z.strictObject({
  decision: z.literal('succeeded'), command_id: z.uuid(), result_version: z.number().int().min(2).max(2147483647),
});
const ClaimedSchema = z.strictObject({
  decision: z.literal('claimed'), command_id: z.uuid(), public_file_id: z.uuid(), source_file_id: z.uuid(),
  source_location: LocationSchema, public_location: LocationSchema,
  source_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  source_size_bytes: z.number().int().positive().max(RENDERING_UPLOAD_MAX_BYTES),
  target_version: z.number().int().min(2).max(2147483647),
});
const BeginSchema = z.union([
  z.strictObject({ decision: z.enum(['invalid_request', 'not_found', 'idempotency_conflict', 'in_progress',
    'lease_conflict', 'version_conflict', 'not_publishable']) }), SucceededSchema, ClaimedSchema,
]);
const CompleteSchema = z.union([
  z.strictObject({ decision: z.enum(['not_found', 'lease_conflict', 'version_conflict', 'not_publishable']) }), SucceededSchema,
]);
const FailSchema = z.union([
  z.strictObject({ decision: z.enum(['invalid_request', 'not_found', 'lease_conflict', 'failed']) }), SucceededSchema,
]);
export type BeginDecision = z.infer<typeof BeginSchema>;
export type CompleteDecision = z.infer<typeof CompleteSchema>;
export type FailDecision = z.infer<typeof FailSchema>;

export class TenantRenderingPublicationRepository {
  constructor(private readonly client: TenantRenderingPublicationDatabaseClient = SupabaseDB.getAdminClient()) {}

  private async command<Decision>(name: string, params: Record<string, unknown>, schema: z.ZodType<Decision>, message: string): Promise<Decision> {
    let result: { data: unknown; error: unknown };
    try { result = await this.client.rpc(name, params); }
    catch { throw Errors.dbError(message); }
    if (result.error) throw Errors.dbError(message);
    const parsed = schema.safeParse(result.data);
    if (!parsed.success) throw Errors.dbError('装修效果素材发布命令数据格式异常');
    return parsed.data;
  }

  async begin(input: BeginPublicationInput): Promise<BeginDecision> {
    return this.command('begin_tenant_rendering_style_publish', {
      p_tenant_id: input.tenantId, p_style_id: input.styleId, p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey, p_request_hash: input.requestHash, p_lease_token: input.leaseToken,
    }, BeginSchema, '创建装修效果素材发布命令失败');
  }

  async complete(input: CompletePublicationInput): Promise<CompleteDecision> {
    return this.command('complete_tenant_rendering_style_publish', {
      p_tenant_id: input.tenantId, p_command_id: input.commandId, p_lease_token: input.leaseToken,
      p_public_url: input.publicUrl, p_employee_id: input.employeeId,
    }, CompleteSchema, '完成装修效果素材发布失败');
  }

  async fail(input: FailPublicationInput): Promise<FailDecision> {
    return this.command('fail_tenant_rendering_style_publish', {
      p_tenant_id: input.tenantId, p_command_id: input.commandId, p_lease_token: input.leaseToken, p_failure_code: input.failureCode,
    }, FailSchema, '记录装修效果素材发布失败');
  }
}

export const tenantRenderingPublicationRepository = new TenantRenderingPublicationRepository();
