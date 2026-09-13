import { z } from 'zod';
import { RenderingUploadMimeSchema, RenderingUploadPurposeSchema, RENDERING_UPLOAD_MAX_BYTES } from '@gooes/domain';
import { Errors } from '@/errors/error-factory';
import { SupabaseDB } from '@/utils/supabase';

const timestamp = z.iso.datetime({ offset: true });
const size = z.number().int().min(1).max(RENDERING_UPLOAD_MAX_BYTES);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const rowSchema = z.strictObject({
  id: z.uuid(), tenant_id: z.uuid(), channel: z.enum(['wechat', 'douyin']),
  subject_key_version: z.number().int().min(1).max(32_767), subject_digest: digest,
  application_id: z.string().min(1).nullable(), installation_id: z.uuid().nullable(),
  purpose: RenderingUploadPurposeSchema, declared_mime_type: RenderingUploadMimeSchema,
  declared_size_bytes: size, bucket: z.string().trim().min(1), region: z.string().trim().min(1),
  raw_object_key: z.string().min(1), normalized_object_key: z.string().min(1).nullable(),
  normalized_size_bytes: size.nullable(), width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(), checksum: digest.nullable(),
  status: z.enum(['issued', 'processing', 'pending_review', 'approved', 'rejected', 'failed', 'deleted']),
  expires_at: timestamp, processing_lease_expires_at: timestamp.nullable(),
  raw_cleanup_after: timestamp, raw_deleted_at: timestamp.nullable(),
}).refine((row) => row.channel === 'wechat'
  ? row.application_id === null && row.installation_id === null
  : row.application_id !== null && row.installation_id !== null)
  .refine((row) => row.status !== 'processing' || row.processing_lease_expires_at !== null)
  .refine((row) => !['pending_review', 'approved'].includes(row.status)
    || [row.normalized_object_key, row.normalized_size_bytes, row.width, row.height, row.checksum]
      .every((value) => value !== null));
const ROW_SELECT = Object.keys(rowSchema.shape).join(',');
const changedSchema = z.strictObject({ id: z.uuid() }).nullable();
type DatabaseResult = { data: unknown; error: unknown; count?: number | null };
interface Query extends PromiseLike<DatabaseResult> {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  is(column: string, value: null): Query;
  gt(column: string, value: unknown): Query;
  gte(column: string, value: unknown): Query;
  lte(column: string, value: unknown): Query;
  order(column: string, options: { ascending: boolean }): Query;
  limit(count: number): Query;
  maybeSingle(): PromiseLike<DatabaseResult>;
}
interface DatabaseClient {
  from(table: string): {
    select(columns: string, options?: { head: true; count: 'exact' }): Query;
    insert(value: Record<string, unknown>): PromiseLike<DatabaseResult>;
    update(value: Record<string, unknown>): Query;
  };
}

export type CustomerInputRow = z.infer<typeof rowSchema>;
export interface CustomerInputOwner {
  tenantId: string;
  channel: 'wechat' | 'douyin';
  subjectKeyVersion: number;
  subjectDigest: string;
  applicationId: string | null;
  installationId: string | null;
}
export interface CreateCustomerInput {
  id: string; purpose: 'room' | 'floor_plan'; mimeType: string; sizeBytes: number;
  bucket: string; region: string; rawObjectKey: string; expiresAt: string;
}
export interface NormalizedCustomerInput {
  objectKey: string; sizeBytes: number; width: number; height: number; checksum: string;
}
export interface RawCleanupClaim {
  tenantId: string; id: string; previousDue: string; nextDue: string;
  status: CustomerInputRow['status']; now: string;
}
export interface CustomerRenderingInputsRepositoryPort {
  createIssued(owner: CustomerInputOwner, input: CreateCustomerInput): Promise<void>;
  findOwned(owner: CustomerInputOwner, id: string): Promise<CustomerInputRow | null>;
  countRecent(owner: CustomerInputOwner, since: string): Promise<number>;
  claimProcessing(owner: CustomerInputOwner, id: string, leaseUntil: string, now: string): Promise<boolean>;
  markNormalized(owner: CustomerInputOwner, id: string, result: NormalizedCustomerInput, leaseUntil: string, now: string): Promise<boolean>;
  markFailed(owner: CustomerInputOwner, id: string, leaseUntil: string | null, now: string): Promise<boolean>;
  listRawCleanupDue(now: string, limit: number): Promise<CustomerInputRow[]>;
  claimRawCleanup(input: RawCleanupClaim): Promise<boolean>;
  markRawDeleted(tenantId: string, id: string, claimedDue: string, now: string): Promise<boolean>;
}

export class CustomerRenderingInputsRepository implements CustomerRenderingInputsRepositoryPort {
  // Supabase's recursive result generics exceed TS depth for this narrow ungenerated-table port.
  // Only installed select/filter/update methods cross this boundary; all returned data is parsed.
  constructor(private readonly client: DatabaseClient = SupabaseDB.getAdminClient() as unknown as DatabaseClient) {}

  async createIssued(owner: CustomerInputOwner, input: CreateCustomerInput): Promise<void> {
    await execute(this.table().insert({
      id: input.id, tenant_id: owner.tenantId, channel: owner.channel,
      subject_key_version: owner.subjectKeyVersion, subject_digest: owner.subjectDigest,
      application_id: owner.applicationId, installation_id: owner.installationId,
      purpose: input.purpose, declared_mime_type: input.mimeType, declared_size_bytes: input.sizeBytes,
      bucket: input.bucket, region: input.region, raw_object_key: input.rawObjectKey,
      expires_at: input.expiresAt, status: 'issued',
    }));
  }

  async findOwned(owner: CustomerInputOwner, id: string): Promise<CustomerInputRow | null> {
    const { data } = await execute(this.owned(this.table().select(ROW_SELECT), owner)
      .eq('id', id).limit(1).maybeSingle());
    return parse(rowSchema.nullable(), data);
  }

  async countRecent(owner: CustomerInputOwner, since: string): Promise<number> {
    const { count } = await execute(this.owned(this.table().select('id', { head: true, count: 'exact' }), owner)
      .gte('created_at', since));
    return parse(z.number().int().nonnegative(), count);
  }

  async claimProcessing(owner: CustomerInputOwner, id: string, leaseUntil: string, now: string): Promise<boolean> {
    assertFuture(leaseUntil, now);
    const claim = (status: 'issued' | 'processing') => this.owned(this.table().update({
      status: 'processing', processing_lease_expires_at: leaseUntil,
    }), owner).eq('id', id).eq('status', status).gt('expires_at', now).is('raw_deleted_at', null);
    if (await changed(claim('issued'))) return true;
    // A single conditional UPDATE reclaims only expired leases; no read/write gap.
    return changed(claim('processing').lte('processing_lease_expires_at', now));
  }

  async markNormalized(owner: CustomerInputOwner, id: string, result: NormalizedCustomerInput, leaseUntil: string, now: string): Promise<boolean> {
    return changed(this.owned(this.table().update({
      normalized_object_key: result.objectKey, normalized_size_bytes: result.sizeBytes,
      width: result.width, height: result.height, checksum: result.checksum,
      status: 'pending_review', processing_lease_expires_at: null,
    }), owner).eq('id', id).eq('status', 'processing')
      .eq('processing_lease_expires_at', leaseUntil).gt('processing_lease_expires_at', now)
      .is('raw_deleted_at', null));
  }

  async markFailed(owner: CustomerInputOwner, id: string, leaseUntil: string | null, now: string): Promise<boolean> {
    const query = this.owned(this.table().update({ status: 'failed', processing_lease_expires_at: null }), owner)
      .eq('id', id).eq('status', leaseUntil === null ? 'issued' : 'processing');
    return changed(leaseUntil === null ? query : query
      .eq('processing_lease_expires_at', leaseUntil).gt('processing_lease_expires_at', now));
  }

  async listRawCleanupDue(now: string, limit: number): Promise<CustomerInputRow[]> {
    if (!Number.isInteger(limit) || limit < 1) throw Errors.badRequest('清理批次大小无效');
    const { data } = await execute(this.table().select(ROW_SELECT).is('raw_deleted_at', null)
      .lte('raw_cleanup_after', now).order('raw_cleanup_after', { ascending: true })
      .order('id', { ascending: true }).limit(Math.min(limit, 100)));
    return parse(z.array(rowSchema), data);
  }

  // System-worker operations use tenant/id plus the claimed due timestamp as a fencing token.
  async claimRawCleanup(input: RawCleanupClaim): Promise<boolean> {
    assertFuture(input.nextDue, input.now);
    const closesUpload = input.status === 'issued' || input.status === 'processing';
    let query = this.table().update({
      raw_cleanup_after: input.nextDue,
      ...(closesUpload ? { status: 'deleted', processing_lease_expires_at: null } : {}),
    }).eq('tenant_id', input.tenantId).eq('id', input.id).eq('status', input.status)
      .eq('raw_cleanup_after', input.previousDue).lte('raw_cleanup_after', input.now)
      .is('raw_deleted_at', null);
    if (input.status === 'issued') query = query.lte('expires_at', input.now);
    if (input.status === 'processing') query = query.lte('processing_lease_expires_at', input.now);
    return changed(query);
  }

  async markRawDeleted(tenantId: string, id: string, claimedDue: string, now: string): Promise<boolean> {
    return changed(this.table().update({ raw_deleted_at: now }).eq('tenant_id', tenantId).eq('id', id)
      .eq('raw_cleanup_after', claimedDue).gt('raw_cleanup_after', now).is('raw_deleted_at', null));
  }

  private table() { return this.client.from('customer_rendering_inputs'); }

  private owned(query: Query, owner: CustomerInputOwner): Query {
    const scoped = query.eq('tenant_id', owner.tenantId).eq('channel', owner.channel)
      .eq('subject_key_version', owner.subjectKeyVersion).eq('subject_digest', owner.subjectDigest);
    const application = owner.applicationId === null
      ? scoped.is('application_id', null) : scoped.eq('application_id', owner.applicationId);
    return owner.installationId === null
      ? application.is('installation_id', null) : application.eq('installation_id', owner.installationId);
  }
}

async function execute(query: PromiseLike<DatabaseResult>): Promise<DatabaseResult> {
  let result: DatabaseResult;
  try { result = await query; } catch { throw Errors.dbError('私有输入账本操作失败'); }
  if (result.error) throw Errors.dbError('私有输入账本操作失败');
  return result;
}

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw Errors.dbError('私有输入账本响应无效');
  return result.data;
}

async function changed(query: Query): Promise<boolean> {
  const { data } = await execute(query.select('id').limit(1).maybeSingle());
  return parse(changedSchema, data) !== null;
}

function assertFuture(value: string, now: string): void {
  if (!timestamp.safeParse(value).success || !timestamp.safeParse(now).success || Date.parse(value) <= Date.parse(now)) {
    throw Errors.badRequest('租约时间无效');
  }
}
