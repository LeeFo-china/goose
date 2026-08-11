import {
  PLATFORM_SERVICE_TRIAL_STATUS_VALUES,
  type PlatformServiceTrialScopeV1,
  type PlatformServiceTrialSource,
  type PlatformServiceTrialStatus,
  type PlatformServiceTrialType,
} from '@gooes/domain';
import { z } from 'zod';

import { ErrorCodes } from '@/errors/error-codes';
import { Errors } from '@/errors/error-factory';
import { matchesPostgresError } from '@/errors/postgres-error-details';
import { SupabaseDB } from '@/utils/supabase/index';
import {
  AssignResultSchema,
  CommandResultSchema,
  PolicyCommandResultSchema,
  SERVICE_TRIAL_EVENT_LIMIT,
  TrialDetailSchema,
  TrialListRawSchema,
  TenantTrialListRawSchema,
  TrialPolicySchema,
  TrialRowSchema,
  TrialSummarySchema,
  type PolicyCommandResult,
  type SafeTrialCommandSnapshot,
  type TrialCommandResult,
  type TrialDetailRecord,
  type TrialListRecord,
  type TrialPolicyRecord,
  type TrialRecord,
  type TrialSummary,
} from './service-trial-records';

export type {
  PolicyCommandResult,
  SafeTrialCommandSnapshot,
  TrialCommandResult,
  TrialDetailRecord,
  TrialListRecord,
  TrialPolicyRecord,
  TrialRecord,
  TrialSummary,
} from './service-trial-records';

const TRIAL_CURRENT_STATUSES: readonly PlatformServiceTrialStatus[] = [
  'pending_review', 'scheduled', 'active', 'grace_period',
];
export type PageData<T> = {
  list: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};
export type TenantTrialListInput = {
  tenantId: string; page?: number; pageSize?: number; status?: PlatformServiceTrialStatus;
  nowIso?: string;
};
export type PlatformTrialListInput = {
  page?: number; pageSize?: number; keyword?: string; status?: PlatformServiceTrialStatus;
  source?: PlatformServiceTrialSource; trialType?: PlatformServiceTrialType;
  assigneeEmployeeId?: string; appliedFrom?: string; appliedTo?: string;
  expiresFrom?: string; expiresTo?: string; nowIso?: string;
};

type ApplyCommand = { action: 'apply'; tenantId: string; actorEmployeeId: string;
  applicationReason: string; expectedUserCount: number; expectedProjectCount: number;
  contactName: string; contactPhone: string; idempotencyKey: string };
type WithdrawCommand = { action: 'withdraw'; trialId: string; tenantId: string;
  actorEmployeeId: string; expectedVersion: number; reason: string; idempotencyKey: string };
type ReviewCommandBase = { action: 'review'; trialId: string; actorEmployeeId: string;
  expectedVersion: number; idempotencyKey: string; reason: string };
type ApprovedReviewCommand = ReviewCommandBase & { decision: 'approved';
  scope?: PlatformServiceTrialScopeV1; trialDays?: number; graceDays?: number;
  startsAt?: string; allowOverride: boolean } & (
    { trialType: 'guided'; assigneeEmployeeId: string }
    | { trialType: 'standard'; assigneeEmployeeId?: string | null }
  );
type RejectedReviewCommand = ReviewCommandBase & { decision: 'rejected';
  trialType?: never; scope?: never; trialDays?: never; graceDays?: never;
  startsAt?: never; assigneeEmployeeId?: never; allowOverride: false };
type ReviewCommand = ApprovedReviewCommand | RejectedReviewCommand;
type GrantCommandBase = { action: 'grant'; tenantId: string; actorEmployeeId: string;
  scope?: PlatformServiceTrialScopeV1; reason: string; idempotencyKey: string;
  trialDays?: number; graceDays?: number; startsAt?: string; allowOverride: boolean };
type GrantCommand = GrantCommandBase & (
  { trialType: 'guided'; assigneeEmployeeId: string }
  | { trialType: 'standard'; assigneeEmployeeId?: string | null }
);
type ExtendCommand = { action: 'extend'; trialId: string; actorEmployeeId: string;
  expectedVersion: number; idempotencyKey: string; extensionDays: number;
  reason: string; allowOverride: boolean };
type RevokeCommand = { action: 'revoke'; trialId: string; actorEmployeeId: string;
  expectedVersion: number; idempotencyKey: string; reason: string };
type AssignCommand = { action: 'assign'; trialId: string; actorEmployeeId: string;
  expectedVersion: number; idempotencyKey: string; assigneeEmployeeId: string | null };
export type TrialCommandInput = ApplyCommand | WithdrawCommand | ReviewCommand
  | GrantCommand | ExtendCommand | RevokeCommand | AssignCommand;
export type TrialPolicyUpdateCommand = {
  actorEmployeeId: string;
  expectedVersion: number;
  idempotencyKey: string;
  reason: string;
  policy: {
    trialDays: number;
    graceDays: number;
    reminderDays: number[];
    maxTrialDays: number;
    maxGraceDays: number;
    maxScheduleDays: number;
    maxExtensionCount: number;
    maxExtensionDays: number;
    reapplyCooldownDays: number;
    allowRepeat: boolean;
    standardScope: PlatformServiceTrialScopeV1;
    guidedScope: PlatformServiceTrialScopeV1;
  };
};

type QueryResult = { data: unknown; error: unknown; count?: number | null };
export type ServiceTrialQuery = PromiseLike<QueryResult> & {
  select(columns: string, options?: { count: 'exact' }): ServiceTrialQuery;
  eq(column: string, value: unknown): ServiceTrialQuery;
  in(column: string, values: readonly unknown[]): ServiceTrialQuery;
  ilike(column: string, pattern: string): ServiceTrialQuery;
  or(filter: string): ServiceTrialQuery;
  gte(column: string, value: unknown): ServiceTrialQuery;
  lte(column: string, value: unknown): ServiceTrialQuery;
  order(column: string, options: { ascending: boolean; referencedTable?: string }): ServiceTrialQuery;
  range(from: number, to: number): ServiceTrialQuery;
  limit(value: number, options?: { referencedTable: string }): ServiceTrialQuery;
  maybeSingle(): PromiseLike<QueryResult>;
};
export type ServiceTrialClient = {
  from(table: 'tenant_service_trials' | 'platform_service_trial_policies'): ServiceTrialQuery;
  rpc(name: string, params: Record<string, unknown>): PromiseLike<QueryResult>;
};

const TRIAL_COLUMNS = 'id,tenant_id,source,trial_type,status,application_reason,expected_user_count,expected_project_count,contact_name,contact_phone,grant_reason,review_decision,review_reason,revoke_reason,withdraw_reason,requested_at,reviewed_at,granted_at,starts_at,activated_at,trial_ends_at,grace_ends_at,withdrawn_at,revoked_at,converted_at,converted_order_id,granted_by_employee_id,reviewed_by_employee_id,requested_by_employee_id,revoked_by_employee_id,withdrawn_by_employee_id,assignee_employee_id,scope_snapshot,policy_snapshot,extension_count,version,created_at,updated_at';
const TENANT_RELATION = 'tenant:tenants!tenant_service_trials_tenant_id_fkey(id,name,slug)';
const ASSIGNEE_RELATION = 'assignee:employees!tenant_service_trials_assignee_employee_id_fkey(id,name,phone,status)';
const EVENT_RELATION = 'events:tenant_service_trial_events!tenant_service_trial_events_trial_identity_fkey(id,tenant_id,trial_id,event_key,event_type,from_status,to_status,reason,actor_employee_id,metadata,occurred_at,created_at)';
const POLICY_COLUMNS = 'id,is_current,trial_days,grace_days,reminder_days,max_trial_days,max_grace_days,max_schedule_days,max_extension_count,max_extension_days,reapply_cooldown_days,allow_repeat,standard_scope,guided_scope,version,change_reason,created_at,updated_at';

function pagination(page?: number, pageSize?: number) {
  const normalizedPage = Math.max(1, Math.floor(page || 1));
  const normalizedSize = Math.min(100, Math.max(1, Math.floor(pageSize || 20)));
  const from = (normalizedPage - 1) * normalizedSize;
  return { page: normalizedPage, pageSize: normalizedSize, from, to: from + normalizedSize - 1 };
}

function parse<T>(schema: z.ZodType<T>, data: unknown, fallback: string): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw Errors.dbError(fallback);
  return parsed.data;
}

async function querySafely(
  operation: () => PromiseLike<QueryResult>, fallback: string,
): Promise<QueryResult> {
  try {
    return await operation();
  } catch {
    throw Errors.dbError(fallback);
  }
}

function pageData<T>(list: T[], count: number | null | undefined,
  page: ReturnType<typeof pagination>): PageData<T> {
  if (count === null || count === undefined || !Number.isSafeInteger(count)
    || count < 0 || count < list.length) throw Errors.dbError('分页总数无效');
  const total = count;
  return { list, pagination: { page: page.page, pageSize: page.pageSize,
    total, totalPages: total === 0 ? 0 : Math.ceil(total / page.pageSize) } };
}

const ListEnvelopeBaseSchema = {
  total: z.number().int().nonnegative(), page: z.number().int().positive(),
  page_size: z.number().int().min(1).max(100), server_time: z.iso.datetime({ offset: true }),
};
const TenantListEnvelopeSchema = z.object({
  items: z.array(z.object({ trial: TenantTrialListRawSchema,
    effective_status: z.enum(PLATFORM_SERVICE_TRIAL_STATUS_VALUES) }).strict()),
  ...ListEnvelopeBaseSchema,
}).strict();
const PlatformListEnvelopeSchema = z.object({
  items: z.array(z.object({ trial: TrialListRawSchema,
    effective_status: z.enum(PLATFORM_SERVICE_TRIAL_STATUS_VALUES) }).strict()),
  ...ListEnvelopeBaseSchema,
}).strict();

function listParams(input: PlatformTrialListInput, page: ReturnType<typeof pagination>,
  tenantId: string | null, platform: boolean) {
  return { p_tenant_id: tenantId, p_platform: platform,
    p_page: page.page, p_page_size: page.pageSize,
    p_keyword: input.keyword?.trim() || null, p_status: input.status ?? null,
    p_source: input.source ?? null, p_trial_type: input.trialType ?? null,
    p_assignee_employee_id: input.assigneeEmployeeId ?? null,
    p_applied_from: input.appliedFrom ?? null, p_applied_to: input.appliedTo ?? null,
    p_expires_from: input.expiresFrom ?? null, p_expires_to: input.expiresTo ?? null,
    p_now: input.nowIso ?? new Date().toISOString() };
}

function parseListEnvelope<T extends TrialRecord | TrialListRecord>(data: unknown,
  schema: typeof TenantListEnvelopeSchema | typeof PlatformListEnvelopeSchema,
  input: { status?: PlatformServiceTrialStatus; nowIso?: string },
  page: ReturnType<typeof pagination>, fallback: string): PageData<T> {
  const envelope = parse(schema, data, fallback);
  if (envelope.page !== page.page || envelope.page_size !== page.pageSize
    || input.nowIso !== undefined
      && Date.parse(envelope.server_time) !== Date.parse(input.nowIso)
    || envelope.items.some((item) => input.status !== undefined
      && item.effective_status !== input.status)) throw Errors.dbError(fallback);
  return pageData(envelope.items.map((item) => item.trial) as T[], envelope.total, page);
}

const COMMAND_ERRORS = {
  SERVICE_TRIAL_NOT_FOUND: [404, '技术服务试用不存在'],
  SERVICE_TRIAL_REPEAT_REQUIRES_OVERRIDE: [403, '重复试用需要平台特批'],
  SERVICE_TRIAL_APPLICATION_PENDING: [409, '已有待审核试用申请'],
  SERVICE_TRIAL_ACTIVE_EXISTS: [409, '当前已有可用试用'],
  SERVICE_TRIAL_FORMAL_SERVICE_ACTIVE: [409, '正式服务有效时不能申请试用'],
  SERVICE_TRIAL_REAPPLY_COOLDOWN: [409, '试用再次申请仍在冷却期'],
  SERVICE_TRIAL_ENTERPRISE_IDENTITY_REQUIRED: [409, '需要先完成企业身份认证'],
  SERVICE_TRIAL_ACTION_NOT_ALLOWED: [409, '当前试用状态不允许此操作'],
  SERVICE_TRIAL_VERSION_CONFLICT: [409, '试用信息已更新，请刷新后重试'],
  SERVICE_TRIAL_IDEMPOTENCY_CONFLICT: [409, '重复请求参数不一致'],
  SERVICE_TRIAL_EXTENSION_INVALID: [400, '试用延期参数无效'],
} as const;

function throwCommandError(error: unknown): never {
  if (matchesPostgresError(error, 'P0001', 'SERVICE_TRIAL_OVERRIDE_REQUIRED')) {
    throw Errors.business(403, '缺少平台操作权限',
      ErrorCodes.PLATFORM_PERMISSION_REQUIRED,
      { permission: 'platform.service_trial.override' });
  }
  for (const [code, [status, message]] of Object.entries(COMMAND_ERRORS)) {
    if (matchesPostgresError(error, 'P0001', code)) {
      throw Errors.business(status, message, code);
    }
  }
  throw Errors.dbError('执行技术服务试用操作失败');
}

function commandCall(input: TrialCommandInput): [string, Record<string, unknown>] {
  switch (input.action) {
    case 'apply': return ['platform_service_trial_apply', { p_tenant_id: input.tenantId,
      p_actor_employee_id: input.actorEmployeeId, p_application_reason: input.applicationReason,
      p_expected_user_count: input.expectedUserCount, p_expected_project_count: input.expectedProjectCount,
      p_contact_name: input.contactName, p_contact_phone: input.contactPhone,
      p_idempotency_key: input.idempotencyKey }];
    case 'withdraw': return ['platform_service_trial_withdraw', { p_trial_id: input.trialId,
      p_tenant_id: input.tenantId, p_actor_employee_id: input.actorEmployeeId,
      p_expected_version: input.expectedVersion, p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey }];
    case 'review': return ['platform_service_trial_review', { p_trial_id: input.trialId,
      p_actor_employee_id: input.actorEmployeeId, p_decision: input.decision,
      p_expected_version: input.expectedVersion, p_idempotency_key: input.idempotencyKey,
      p_reason: input.reason, p_trial_type: input.trialType ?? null, p_scope: input.scope ?? null,
      p_trial_days: input.trialDays ?? null, p_grace_days: input.graceDays ?? null,
      p_starts_at: input.startsAt ?? null, p_assignee_employee_id: input.assigneeEmployeeId ?? null,
      p_allow_override: input.allowOverride }];
    case 'grant': return ['platform_service_trial_grant', { p_tenant_id: input.tenantId,
      p_actor_employee_id: input.actorEmployeeId, p_trial_type: input.trialType,
      p_scope: input.scope ?? null, p_reason: input.reason, p_idempotency_key: input.idempotencyKey,
      p_trial_days: input.trialDays ?? null, p_grace_days: input.graceDays ?? null,
      p_starts_at: input.startsAt ?? null, p_assignee_employee_id: input.assigneeEmployeeId ?? null,
      p_allow_override: input.allowOverride }];
    case 'extend': return ['platform_service_trial_extend', { p_trial_id: input.trialId,
      p_actor_employee_id: input.actorEmployeeId, p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey, p_extension_days: input.extensionDays,
      p_reason: input.reason, p_allow_override: input.allowOverride }];
    case 'revoke': return ['platform_service_trial_revoke', { p_trial_id: input.trialId,
      p_actor_employee_id: input.actorEmployeeId, p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey, p_reason: input.reason }];
    case 'assign': return ['platform_service_trial_assign', { p_trial_id: input.trialId,
      p_actor_employee_id: input.actorEmployeeId, p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
      p_assignee_employee_id: input.assigneeEmployeeId }];
  }
}

export class ServiceTrialRepository {
  constructor(private readonly clientProvider: () => ServiceTrialClient = () =>
    SupabaseDB.getAdminClient() as unknown as ServiceTrialClient) {}

  async listTenantTrials(input: TenantTrialListInput): Promise<PageData<TrialRecord>> {
    const page = pagination(input.page, input.pageSize);
    const params = listParams(input, page, input.tenantId, false);
    const result = await querySafely(() => this.clientProvider().rpc(
      'platform_service_trial_list', params,
    ), '查询技术服务试用记录失败');
    if (result.error) throw Errors.dbError('查询技术服务试用记录失败');
    const parsed = parseListEnvelope<TrialRecord>(result.data, TenantListEnvelopeSchema,
      input, page, '查询技术服务试用记录失败');
    if (parsed.list.some((trial) => trial.tenant_id !== input.tenantId)) {
      throw Errors.dbError('查询技术服务试用记录失败');
    }
    return parsed;
  }

  async findCurrentTenantTrial(tenantId: string): Promise<TrialRecord | null> {
    const query = this.clientProvider().from('tenant_service_trials').select(TRIAL_COLUMNS)
      .eq('tenant_id', tenantId).in('status', TRIAL_CURRENT_STATUSES)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .limit(1).maybeSingle();
    const result = await querySafely(() => query, '查询当前技术服务试用失败');
    if (result.error) throw Errors.dbError('查询当前技术服务试用失败');
    if (result.data === null) return null;
    const trial = parse(TrialRowSchema, result.data, '查询当前技术服务试用失败');
    if (trial.tenant_id !== tenantId || !TRIAL_CURRENT_STATUSES.includes(trial.status)) {
      throw Errors.dbError('查询当前技术服务试用失败');
    }
    return trial;
  }

  async listPlatformTrials(input: PlatformTrialListInput): Promise<PageData<TrialListRecord>> {
    const page = pagination(input.page, input.pageSize);
    const params = listParams(input, page, null, true);
    const result = await querySafely(() => this.clientProvider().rpc(
      'platform_service_trial_list', params,
    ), '查询平台技术服务试用列表失败');
    if (result.error) throw Errors.dbError('查询平台技术服务试用列表失败');
    const parsed = parseListEnvelope<TrialListRecord>(result.data,
      PlatformListEnvelopeSchema, input, page, '查询平台技术服务试用列表失败');
    if (parsed.list.some((trial) => input.source !== undefined && trial.source !== input.source
      || input.trialType !== undefined && trial.trial_type !== input.trialType
      || input.assigneeEmployeeId !== undefined
        && trial.assignee_employee_id !== input.assigneeEmployeeId)) {
      throw Errors.dbError('查询平台技术服务试用列表失败');
    }
    return parsed;
  }

  async getPlatformSummary(nowIso: string): Promise<TrialSummary> {
    const result = await querySafely(() => this.clientProvider().rpc(
      'platform_service_trial_platform_summary', { p_now: nowIso },
    ), '查询平台技术服务试用概览失败');
    if (result.error) throw Errors.dbError('查询平台技术服务试用概览失败');
    const summary = parse(TrialSummarySchema, result.data, '查询平台技术服务试用概览失败');
    if (Date.parse(summary.server_time) !== Date.parse(nowIso)) {
      throw Errors.dbError('查询平台技术服务试用概览失败');
    }
    return summary;
  }

  async findTrialById(input: { id: string; tenantId?: string }): Promise<TrialDetailRecord | null> {
    let query = this.clientProvider().from('tenant_service_trials')
      .select(`${TRIAL_COLUMNS},${TENANT_RELATION},${ASSIGNEE_RELATION},${EVENT_RELATION}`)
      .eq('id', input.id);
    if (input.tenantId) query = query.eq('tenant_id', input.tenantId);
    const request = query.order('occurred_at', { ascending: false, referencedTable: 'events' })
      .order('id', { ascending: false, referencedTable: 'events' })
      .limit(SERVICE_TRIAL_EVENT_LIMIT, { referencedTable: 'events' }).maybeSingle();
    const result = await querySafely(() => request, '查询技术服务试用详情失败');
    if (result.error) throw Errors.dbError('查询技术服务试用详情失败');
    if (result.data === null) return null;
    const trial = parse(TrialDetailSchema, result.data, '查询技术服务试用详情失败');
    if (trial.id !== input.id
      || input.tenantId !== undefined && trial.tenant_id !== input.tenantId) {
      throw Errors.dbError('查询技术服务试用详情失败');
    }
    return trial;
  }

  async findCurrentPolicy(): Promise<TrialPolicyRecord | null> {
    const query = this.clientProvider().from('platform_service_trial_policies')
      .select(POLICY_COLUMNS).eq('is_current', true).limit(1).maybeSingle();
    const result = await querySafely(() => query, '查询技术服务试用策略失败');
    if (result.error) throw Errors.dbError('查询技术服务试用策略失败');
    if (result.data === null) return null;
    const policy = parse(TrialPolicySchema, result.data, '查询技术服务试用策略失败');
    if (!policy.is_current) throw Errors.dbError('查询技术服务试用策略失败');
    return policy;
  }

  async findPolicyById(id: string): Promise<TrialPolicyRecord | null> {
    const query = this.clientProvider().from('platform_service_trial_policies')
      .select(POLICY_COLUMNS).eq('id', id).limit(1).maybeSingle();
    const result = await querySafely(() => query, '查询技术服务试用策略失败');
    if (result.error) throw Errors.dbError('查询技术服务试用策略失败');
    if (result.data === null) return null;
    const policy = parse(TrialPolicySchema, result.data, '查询技术服务试用策略失败');
    if (policy.id !== id) throw Errors.dbError('查询技术服务试用策略失败');
    return policy;
  }

  async executeCommand(input: TrialCommandInput): Promise<TrialCommandResult> {
    const [name, params] = commandCall(input);
    let result: QueryResult;
    try {
      result = await this.clientProvider().rpc(name, params);
    } catch {
      throw Errors.dbError('执行技术服务试用操作失败');
    }
    if (result.error) throwCommandError(result.error);
    const parsed = parse(input.action === 'assign' ? AssignResultSchema : CommandResultSchema,
      result.data, '执行技术服务试用操作失败');
    if ('tenantId' in input && parsed.tenant_id !== input.tenantId
      || 'trialId' in input && parsed.trial_id !== input.trialId) {
      throw Errors.dbError('执行技术服务试用操作失败');
    }
    if (input.action === 'assign' && 'assigned' in parsed
      && parsed.assigned !== (input.assigneeEmployeeId !== null)) {
      throw Errors.dbError('执行技术服务试用操作失败');
    }
    return parsed;
  }

  async updatePolicy(
    input: TrialPolicyUpdateCommand,
  ): Promise<PolicyCommandResult> {
    let result: QueryResult;
    try {
      result = await this.clientProvider().rpc(
        'platform_service_trial_update_policy',
        {
          p_actor_employee_id: input.actorEmployeeId,
          p_expected_version: input.expectedVersion,
          p_idempotency_key: input.idempotencyKey,
          p_policy: {
            trial_days: input.policy.trialDays,
            grace_days: input.policy.graceDays,
            reminder_days: input.policy.reminderDays,
            max_trial_days: input.policy.maxTrialDays,
            max_grace_days: input.policy.maxGraceDays,
            max_schedule_days: input.policy.maxScheduleDays,
            max_extension_count: input.policy.maxExtensionCount,
            max_extension_days: input.policy.maxExtensionDays,
            reapply_cooldown_days: input.policy.reapplyCooldownDays,
            allow_repeat: input.policy.allowRepeat,
            standard_scope: input.policy.standardScope,
            guided_scope: input.policy.guidedScope,
          },
          p_reason: input.reason,
        },
      );
    } catch {
      throw Errors.dbError('更新技术服务试用策略失败');
    }
    if (result.error) throwCommandError(result.error);
    return parse(
      PolicyCommandResultSchema,
      result.data,
      '更新技术服务试用策略失败',
    );
  }
}

export const serviceTrialRepository = new ServiceTrialRepository();
