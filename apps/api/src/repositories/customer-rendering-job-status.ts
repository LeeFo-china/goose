import { z } from 'zod';
import { Errors } from '@/errors/error-factory';
import { SupabaseDB } from '@/utils/supabase';
import type { CustomerInputOwner } from './customer-rendering-inputs';

const timestamp = z.iso.datetime({ offset: true });
const rowSchema = z.strictObject({
  id: z.uuid(), status: z.enum(['queued', 'processing', 'succeeded', 'failed', 'review_required']),
  created_at: timestamp, updated_at: timestamp, finished_at: timestamp.nullable(),
  attempt_id: z.uuid().nullable(), output_review_decision: z.enum(['approved', 'rejected', 'manual']).nullable(),
  result_bucket: z.string().min(1).nullable(), result_region: z.string().min(1).nullable(),
  result_object_key: z.string().min(1).nullable(),
  result_sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  result_size_bytes: z.number().int().positive().max(10 * 1024 * 1024).nullable(),
}).refine((row) => row.status !== 'succeeded' || (row.attempt_id !== null
  && row.output_review_decision === 'approved' && row.result_bucket !== null
  && row.result_region !== null && row.result_object_key !== null
  && row.result_sha256 !== null && row.result_size_bytes !== null));
const SELECT = Object.keys(rowSchema.shape).join(',');
export type CustomerRenderingJobStatusRow = z.infer<typeof rowSchema>;
type DatabaseResult = { data: unknown; error: unknown };
interface Query {
  eq(column: string, value: unknown): Query;
  is(column: string, value: null): Query;
  limit(count: number): Query;
  maybeSingle(): PromiseLike<DatabaseResult>;
}
interface DatabaseClient { from(table: string): { select(columns: string): Query } }
export interface CustomerRenderingJobStatusRepositoryPort {
  findOwned(owner: CustomerInputOwner, id: string): Promise<CustomerRenderingJobStatusRow | null>;
}

export class CustomerRenderingJobStatusRepository implements CustomerRenderingJobStatusRepositoryPort {
  constructor(private readonly client: DatabaseClient = SupabaseDB.getAdminClient() as unknown as DatabaseClient) {}

  async findOwned(owner: CustomerInputOwner, id: string): Promise<CustomerRenderingJobStatusRow | null> {
    let query = this.client.from('customer_rendering_jobs').select(SELECT)
      .eq('tenant_id', owner.tenantId).eq('channel', owner.channel)
      .eq('subject_key_version', owner.subjectKeyVersion).eq('subject_digest', owner.subjectDigest)
      .eq('id', id).limit(1);
    query = owner.applicationId === null
      ? query.is('application_id', null) : query.eq('application_id', owner.applicationId);
    query = owner.installationId === null
      ? query.is('installation_id', null) : query.eq('installation_id', owner.installationId);
    let result: DatabaseResult;
    try { result = await query.maybeSingle(); }
    catch { throw Errors.dbError('读取客户生图任务失败'); }
    if (result.error) throw Errors.dbError('读取客户生图任务失败');
    const parsed = rowSchema.nullable().safeParse(result.data);
    if (!parsed.success || (parsed.data && parsed.data.id !== id)) throw Errors.dbError('客户生图任务状态无效');
    return parsed.data;
  }
}

export const customerRenderingJobStatusRepository = new CustomerRenderingJobStatusRepository();
