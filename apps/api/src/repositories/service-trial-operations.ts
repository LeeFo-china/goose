import {
  SERVICE_TRIAL_FOLLOW_UP_STATUS_VALUES,
  SERVICE_TRIAL_FOLLOW_UP_TYPE_VALUES,
  SERVICE_TRIAL_NOTIFICATION_EVENT_VALUES,
  type ServiceTrialFollowUpStatus,
  type ServiceTrialFollowUpType,
} from '@gooes/domain';
import { z } from 'zod';

import { Errors } from '@/errors/error-factory';
import { matchesPostgresError } from '@/errors/postgres-error-details';
import { SupabaseDB } from '@/utils/supabase';

const UuidSchema = z.uuid();
const TimestampSchema = z.iso.datetime({ offset: true });
const NullableTimestampSchema = TimestampSchema.nullable();
const FollowUpRowSchema = z.object({
  id: UuidSchema, trial_id: UuidSchema, tenant_id: UuidSchema,
  follow_up_type: z.enum(SERVICE_TRIAL_FOLLOW_UP_TYPE_VALUES),
  status: z.enum(SERVICE_TRIAL_FOLLOW_UP_STATUS_VALUES),
  summary: z.string().trim().min(1).max(500),
  result: z.string().trim().min(1).max(1000),
  next_follow_up_at: NullableTimestampSchema,
  created_by_employee_id: UuidSchema, created_at: TimestampSchema,
}).strict();
const FollowUpCommandResultSchema = FollowUpRowSchema.extend({
  idempotent: z.boolean(),
}).strict();
const ClaimedDeliverySchema = z.object({
  delivery_id: UuidSchema, lease_token: UuidSchema, trial_id: UuidSchema,
  tenant_id: UuidSchema, recipient_employee_id: UuidSchema,
  event_type: z.enum(SERVICE_TRIAL_NOTIFICATION_EVENT_VALUES),
  source: z.enum(['event', 'time_boundary']),
  trial_status: z.enum([
    'pending_review', 'scheduled', 'active', 'grace_period', 'expired',
    'rejected', 'withdrawn', 'revoked', 'converted',
  ]),
  starts_at: NullableTimestampSchema, trial_ends_at: NullableTimestampSchema,
  grace_ends_at: NullableTimestampSchema,
}).strict();
const CompleteResultSchema = z.object({
  delivery_id: UuidSchema, status: z.literal('sent'),
  notification_id: UuidSchema.nullable(), sent_at: TimestampSchema,
  idempotent: z.boolean(),
}).strict();
const FailResultSchema = z.object({
  delivery_id: UuidSchema, status: z.literal('failed'),
  attempt_count: z.number().int().min(1).max(10), retry_at: TimestampSchema,
  idempotent: z.boolean(),
}).strict();

export type ServiceTrialFollowUpRecord = z.infer<typeof FollowUpRowSchema>;
export type ClaimedTrialNotificationDelivery = z.infer<typeof ClaimedDeliverySchema>;
export type ServiceTrialOperationsPage<T> = {
  list: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

type QueryResult = { data: unknown; error: unknown; count?: number | null };
type OperationsQuery = PromiseLike<QueryResult> & {
  select(columns: string, options?: { count: 'exact' }): OperationsQuery;
  eq(column: string, value: unknown): OperationsQuery;
  order(column: string, options: { ascending: boolean }): OperationsQuery;
  range(from: number, to: number): OperationsQuery;
  maybeSingle(): PromiseLike<QueryResult>;
};
export type ServiceTrialOperationsClient = {
  from(table: string): OperationsQuery;
  rpc(name: string, params: Record<string, unknown>): PromiseLike<QueryResult>;
};

type CreateFollowUpInput = {
  actorEmployeeId: string; trialId: string; tenantId: string;
  followUpType: ServiceTrialFollowUpType;
  status: Exclude<ServiceTrialFollowUpStatus, 'canceled'>;
  summary: string; result: string; nextFollowUpAt?: string | null;
  idempotencyKey: string;
};
type CancelFollowUpInput = {
  actorEmployeeId: string; followUpId: string; trialId: string;
  tenantId: string; idempotencyKey: string;
};

const FOLLOW_UP_COLUMNS = 'id,trial_id,tenant_id,follow_up_type,status,summary,result,next_follow_up_at,created_by_employee_id,created_at';

export class ServiceTrialOperationsRepository {
  constructor(private readonly clientProvider: () => ServiceTrialOperationsClient =
    () => SupabaseDB.getAdminClient() as unknown as ServiceTrialOperationsClient) {}

  async listFollowUps(input: { trialId: string; tenantId: string; page?: number;
    pageSize?: number; status?: ServiceTrialFollowUpStatus }) {
    const page = Math.max(1, Math.floor(input.page || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize || 20)));
    const from = (page - 1) * pageSize;
    let query = this.clientProvider().from('tenant_service_trial_followups')
      .select(FOLLOW_UP_COLUMNS, { count: 'exact' })
      .eq('trial_id', input.trialId).eq('tenant_id', input.tenantId);
    if (input.status) query = query.eq('status', input.status);
    const result = await safely(() => query.order('created_at', { ascending: false })
      .order('id', { ascending: false }).range(from, from + pageSize - 1));
    if (result.error) throw Errors.dbError('查询技术服务试用跟进失败');
    const parsed = z.array(FollowUpRowSchema).safeParse(result.data ?? []);
    const count = result.count;
    if (!parsed.success || typeof count !== 'number' || !Number.isSafeInteger(count)
      || count < 0 || count < parsed.data.length
      || parsed.data.some((row) => row.trial_id !== input.trialId
        || row.tenant_id !== input.tenantId
        || input.status !== undefined && row.status !== input.status)) {
      throw Errors.dbError('技术服务试用跟进事实无效');
    }
    return { list: parsed.data, pagination: { page, pageSize, total: count,
      totalPages: count === 0 ? 0 : Math.ceil(count / pageSize) } };
  }

  async createFollowUp(input: CreateFollowUpInput) {
    const result = await this.command('platform_service_trial_create_follow_up', {
      p_actor_employee_id: input.actorEmployeeId, p_trial_id: input.trialId,
      p_tenant_id: input.tenantId, p_follow_up_type: input.followUpType,
      p_status: input.status, p_summary: input.summary, p_result: input.result,
      p_next_follow_up_at: input.nextFollowUpAt ?? null,
      p_idempotency_key: input.idempotencyKey,
    }, '创建技术服务试用跟进失败');
    return bindFollowUp(result, input.trialId, input.tenantId);
  }

  async cancelFollowUp(input: CancelFollowUpInput) {
    const result = await this.command('platform_service_trial_cancel_follow_up', {
      p_actor_employee_id: input.actorEmployeeId,
      p_follow_up_id: input.followUpId, p_trial_id: input.trialId,
      p_tenant_id: input.tenantId, p_idempotency_key: input.idempotencyKey,
    }, '取消技术服务试用跟进失败');
    const followUp = bindFollowUp(result, input.trialId, input.tenantId);
    if (followUp.id !== input.followUpId || followUp.status !== 'canceled') {
      throw Errors.dbError('取消后的技术服务试用跟进事实无效');
    }
    return followUp;
  }

  async claimNotificationDeliveries(limit: number) {
    const result = await this.command(
      'platform_service_trial_claim_notification_deliveries', { p_limit: limit },
      '领取技术服务试用提醒失败', false,
    );
    return parse(z.array(ClaimedDeliverySchema), result,
      '技术服务试用提醒领取事实无效');
  }

  async findNotificationIdForDelivery(input: { deliveryId: string;
    recipientEmployeeId: string }) {
    const result = await safely(() => this.clientProvider().from('notifications').select('id')
      .eq('target_type', 'service_trial_delivery')
      .eq('target_id', input.deliveryId)
      .eq('recipient_employee_id', input.recipientEmployeeId).maybeSingle());
    if (result.error) throw Errors.dbError('查询技术服务试用提醒通知失败');
    if (result.data === null) return null;
    return parse(z.object({ id: UuidSchema }).strict(), result.data,
      '技术服务试用提醒通知事实无效').id;
  }

  async completeNotificationDelivery(input: { deliveryId: string;
    leaseToken: string; notificationId: string | null }) {
    const result = await this.command(
      'platform_service_trial_complete_notification_delivery', {
        p_delivery_id: input.deliveryId, p_lease_token: input.leaseToken,
        p_notification_id: input.notificationId,
      }, '完成技术服务试用提醒失败', false,
    );
    const parsed = parse(CompleteResultSchema, result, '技术服务试用提醒完成事实无效');
    if (parsed.delivery_id !== input.deliveryId
      || parsed.notification_id !== input.notificationId) {
      throw Errors.dbError('技术服务试用提醒完成事实无效');
    }
    return parsed;
  }

  async failNotificationDelivery(input: { deliveryId: string;
    leaseToken: string; errorCode: string }) {
    const result = await this.command(
      'platform_service_trial_fail_notification_delivery', {
        p_delivery_id: input.deliveryId, p_lease_token: input.leaseToken,
        p_error_code: input.errorCode,
      }, '记录技术服务试用提醒失败', false,
    );
    const parsed = parse(FailResultSchema, result, '技术服务试用提醒失败事实无效');
    if (parsed.delivery_id !== input.deliveryId) {
      throw Errors.dbError('技术服务试用提醒失败事实无效');
    }
    return parsed;
  }

  private async command(name: string, params: Record<string, unknown>, fallback: string,
    mapBusinessErrors = true): Promise<unknown> {
    const result = await safely(() => this.clientProvider().rpc(name, params));
    if (result.error) {
      if (mapBusinessErrors) throwOperationError(result.error);
      throw Errors.dbError(fallback);
    }
    return result.data;
  }
}

function bindFollowUp(data: unknown, trialId: string, tenantId: string) {
  const parsed = parse(FollowUpCommandResultSchema, data,
    '技术服务试用跟进命令事实无效');
  if (parsed.trial_id !== trialId || parsed.tenant_id !== tenantId) {
    throw Errors.dbError('技术服务试用跟进命令事实无效');
  }
  return parsed;
}

function parse<T>(schema: z.ZodType<T>, data: unknown, fallback: string): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw Errors.dbError(fallback);
  return parsed.data;
}

async function safely(operation: () => PromiseLike<QueryResult>) {
  try { return await operation(); } catch { throw Errors.dbError('数据库操作失败'); }
}

function throwOperationError(error: unknown): never {
  const mapping = [
    ['SERVICE_TRIAL_FOLLOW_UP_INVALID', 400, '技术服务试用跟进参数无效'],
    ['SERVICE_TRIAL_FOLLOW_UP_NOT_FOUND', 404, '技术服务试用跟进不存在'],
    ['SERVICE_TRIAL_FOLLOW_UP_STATUS_CONFLICT', 409, '当前跟进状态不可操作'],
    ['SERVICE_TRIAL_IDEMPOTENCY_CONFLICT', 409, '重复请求参数不一致'],
    ['SERVICE_TRIAL_ACTION_NOT_ALLOWED', 403, '缺少平台跟进权限'],
  ] as const;
  for (const [code, status, message] of mapping) {
    if (matchesPostgresError(error, 'P0001', code)) {
      throw Errors.business(status, message, code);
    }
  }
  throw Errors.dbError('执行技术服务试用跟进操作失败');
}

export const serviceTrialOperationsRepository = new ServiceTrialOperationsRepository();
