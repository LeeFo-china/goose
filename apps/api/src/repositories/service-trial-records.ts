import {
  EMPLOYEE_STATUS_VALUES,
  PLATFORM_SERVICE_TRIAL_SOURCE_VALUES,
  PLATFORM_SERVICE_TRIAL_STATUS_VALUES,
  PLATFORM_SERVICE_TRIAL_TYPE_VALUES,
  PlatformServiceTrialScopeSchema,
} from '@gooes/domain';
import { z } from 'zod';

export const SERVICE_TRIAL_EVENT_LIMIT = 100;
const DateTimeSchema = z.iso.datetime({ offset: true });
const NullableDateTimeSchema = DateTimeSchema.nullable();
const NullableUuidSchema = z.uuid().nullable();
const NullableReasonSchema = z.string().trim().min(1).max(1_000).nullable();
const PolicySnapshotSchema = z.object({
  policy_id: z.uuid(),
  version: z.number().int().positive(),
  trial_days: z.number().int().min(1).max(365),
  grace_days: z.number().int().min(0).max(30),
  max_trial_days: z.number().int().min(1).max(365),
  max_grace_days: z.number().int().min(0).max(30),
  max_schedule_days: z.number().int().min(0).max(365),
  max_extension_count: z.number().int().min(0).max(20),
  max_extension_days: z.number().int().min(1).max(365),
  reapply_cooldown_days: z.number().int().min(0).max(365),
  allow_repeat: z.boolean(),
  reminder_days: z.array(z.number().int().positive()).min(1).max(10),
  override_used: z.boolean().optional(),
}).strict().superRefine((policy, context) => {
  if (policy.trial_days > policy.max_trial_days
    || policy.grace_days > policy.max_grace_days
    || new Set(policy.reminder_days).size !== policy.reminder_days.length
    || policy.reminder_days.some((day, index) => day > policy.trial_days
      || index > 0 && policy.reminder_days[index - 1]! <= day)) {
    context.addIssue({ code: 'custom', message: '试用策略快照边界无效' });
  }
});

const TrialRowObjectSchema = z.object({
  id: z.uuid(), tenant_id: z.uuid(),
  source: z.enum(PLATFORM_SERVICE_TRIAL_SOURCE_VALUES),
  trial_type: z.enum(PLATFORM_SERVICE_TRIAL_TYPE_VALUES),
  status: z.enum(PLATFORM_SERVICE_TRIAL_STATUS_VALUES),
  application_reason: z.string().trim().min(1).max(1_000).nullable(),
  expected_user_count: z.number().int().positive().max(100_000).nullable(),
  expected_project_count: z.number().int().positive().max(1_000_000).nullable(),
  contact_name: z.string().trim().min(1).max(80).nullable(),
  contact_phone: z.string().regex(/^1[3-9]\d{9}$/).nullable(),
  grant_reason: NullableReasonSchema,
  review_decision: z.enum(['approved', 'rejected']).nullable(),
  review_reason: NullableReasonSchema,
  revoke_reason: NullableReasonSchema,
  withdraw_reason: NullableReasonSchema,
  requested_at: NullableDateTimeSchema, reviewed_at: NullableDateTimeSchema,
  granted_at: NullableDateTimeSchema, starts_at: NullableDateTimeSchema,
  activated_at: NullableDateTimeSchema, trial_ends_at: NullableDateTimeSchema,
  grace_ends_at: NullableDateTimeSchema, withdrawn_at: NullableDateTimeSchema,
  revoked_at: NullableDateTimeSchema, converted_at: NullableDateTimeSchema,
  converted_order_id: NullableUuidSchema, granted_by_employee_id: NullableUuidSchema,
  reviewed_by_employee_id: NullableUuidSchema,
  requested_by_employee_id: NullableUuidSchema,
  revoked_by_employee_id: NullableUuidSchema,
  withdrawn_by_employee_id: NullableUuidSchema,
  assignee_employee_id: NullableUuidSchema,
  scope_snapshot: PlatformServiceTrialScopeSchema,
  policy_snapshot: PolicySnapshotSchema,
  extension_count: z.number().int().min(0).max(20),
  version: z.number().int().positive(),
  created_at: DateTimeSchema, updated_at: DateTimeSchema,
}).strict();

type TrialRow = z.infer<typeof TrialRowObjectSchema>;

function validateTrialFacts(row: TrialRow, context: z.RefinementCtx): void {
  const issue = (message: string) => context.addIssue({ code: 'custom', message });
  const state = (facts: readonly unknown[]) => {
    const present = facts.filter((fact) => fact !== null).length;
    return present === 0 ? 'empty' : present === facts.length ? 'complete' : 'partial';
  };
  const applicationFacts = [row.application_reason, row.expected_user_count,
    row.expected_project_count, row.contact_name, row.contact_phone,
    row.requested_at, row.requested_by_employee_id];
  if (row.source === 'tenant_application' && applicationFacts.some((fact) => fact === null)) {
    issue('申请来源事实不完整');
  }
  if (row.source === 'platform_grant' && applicationFacts.some((fact) => fact !== null)) {
    issue('平台发放不应包含申请事实');
  }
  const grantFacts = [row.granted_at, row.granted_by_employee_id,
    row.starts_at, row.trial_ends_at, row.grace_ends_at];
  const grantState = state(grantFacts);
  const durationFacts = [row.starts_at, row.trial_ends_at, row.grace_ends_at];
  const reviewState = state([row.review_decision, row.reviewed_at,
    row.reviewed_by_employee_id, row.review_reason]);
  const withdrawState = state([row.withdrawn_at,
    row.withdrawn_by_employee_id, row.withdraw_reason]);
  const revokeState = state([row.revoked_at,
    row.revoked_by_employee_id, row.revoke_reason]);
  const conversionState = state([row.converted_at, row.converted_order_id]);
  if (state(durationFacts) === 'partial' || grantState === 'partial') {
    issue('试用发放时间事实不完整');
  }
  if (reviewState === 'partial') issue('审核事实不完整');
  if (withdrawState === 'partial') issue('撤回事实不完整');
  if (revokeState === 'partial') issue('撤销事实不完整');
  if (conversionState === 'partial') issue('转化事实不完整');

  const grantedStatuses = ['scheduled', 'active', 'grace_period', 'expired', 'revoked'];
  if (grantedStatuses.includes(row.status) && grantState !== 'complete') {
    issue('已发放状态事实不完整');
  }
  if (!grantedStatuses.includes(row.status) && row.status !== 'converted'
    && grantState !== 'empty') issue('当前状态不允许发放事实');
  if (row.status === 'converted' && !['empty', 'complete'].includes(grantState)) {
    issue('已转化试用的发放事实无效');
  }

  if (row.status === 'pending_review'
    && (reviewState !== 'empty' || grantState !== 'empty')) issue('待审核状态事实冲突');
  if (row.status === 'rejected'
    && (reviewState !== 'complete' || row.review_decision !== 'rejected')) {
    issue('驳回事实冲突');
  }
  if (row.status === 'withdrawn' && withdrawState !== 'complete') issue('撤回事实不完整');
  if (row.status === 'revoked' && revokeState !== 'complete') issue('撤销事实不完整');
  if (withdrawState === 'complete' && row.status !== 'withdrawn') issue('撤回事实与状态冲突');
  if (revokeState === 'complete' && row.status !== 'revoked') issue('撤销事实与状态冲突');

  const conversionStatuses = ['converted', 'rejected', 'withdrawn', 'revoked'];
  if (row.status === 'converted' && conversionState !== 'complete') issue('已转化状态事实不完整');
  if (conversionState === 'complete' && !conversionStatuses.includes(row.status)) {
    issue('转化事实与状态冲突');
  }

  const approvedApplicationStatuses = [
    'scheduled', 'active', 'grace_period', 'expired', 'revoked',
  ];
  const isConvertedWithGrant = row.status === 'converted' && grantState === 'complete';
  if (row.source === 'tenant_application'
    && (approvedApplicationStatuses.includes(row.status) || isConvertedWithGrant)
    && (reviewState !== 'complete' || row.review_decision !== 'approved')) {
    issue('租户申请缺少通过审核事实');
  }
  if (row.source === 'platform_grant' && reviewState !== 'empty') {
    issue('平台发放不应包含审核事实');
  }
  if (row.review_decision === 'approved'
    && ![...approvedApplicationStatuses, 'converted'].includes(row.status)) {
    issue('通过审核事实与状态冲突');
  }
  if (row.review_decision === 'rejected' && row.status !== 'rejected') {
    issue('驳回审核事实与状态冲突');
  }
  if (grantState === 'empty' && row.activated_at !== null) issue('激活事实缺少发放事实');
  if (row.status === 'scheduled' && row.activated_at !== null) issue('待开始试用不应已激活');
  if (['active', 'grace_period', 'expired'].includes(row.status)
    && row.activated_at === null) issue('生效状态缺少激活时间');
  if (row.starts_at && row.trial_ends_at && row.grace_ends_at
    && !(Date.parse(row.starts_at) < Date.parse(row.trial_ends_at)
      && Date.parse(row.trial_ends_at) <= Date.parse(row.grace_ends_at)
      && Date.parse(row.trial_ends_at) - Date.parse(row.starts_at) <= 365 * 86_400_000
      && Date.parse(row.grace_ends_at) - Date.parse(row.trial_ends_at) <= 30 * 86_400_000)) {
    issue('试用时间顺序无效');
  }
}

export const TrialRowSchema = TrialRowObjectSchema.superRefine(validateTrialFacts);
const TenantSummarySchema = z.object({
  id: z.uuid(), name: z.string().min(1), slug: z.string().min(1),
}).strict();
const AssigneeSummarySchema = z.object({
  id: z.uuid(), name: z.string().nullable(), phone: z.string().nullable(),
  status: z.enum(EMPLOYEE_STATUS_VALUES).nullable(),
}).strict();
const EventSchema = z.object({
  id: z.uuid(), tenant_id: z.uuid(), trial_id: z.uuid(),
  event_key: z.string().trim().min(1).max(160),
  event_type: z.enum(['application_submitted', 'application_withdrawn',
    'application_approved', 'application_rejected', 'trial_granted',
    'trial_activated', 'trial_grace_started', 'trial_expired', 'trial_extended',
    'trial_revoked', 'trial_assigned', 'formal_purchase_attributed',
    'conversion_anomaly']),
  from_status: z.enum(PLATFORM_SERVICE_TRIAL_STATUS_VALUES).nullable(),
  to_status: z.enum(PLATFORM_SERVICE_TRIAL_STATUS_VALUES).nullable(),
  reason: NullableReasonSchema, actor_employee_id: NullableUuidSchema,
  metadata: z.record(z.string(), z.unknown()),
  occurred_at: DateTimeSchema, created_at: DateTimeSchema,
}).strict();

export const TrialListRawSchema = z.object({
  ...TrialRowObjectSchema.shape,
  tenant: TenantSummarySchema,
  assignee: AssigneeSummarySchema.nullable(),
  keyword_tenant: z.object({}).strict().nullable().optional(),
}).strict().superRefine((row, context) => {
  validateTrialFacts(row, context);
  if (row.tenant.id !== row.tenant_id) {
    context.addIssue({ code: 'custom', message: '租户关联事实冲突' });
  }
  if (row.assignee_employee_id !== (row.assignee?.id ?? null)) {
    context.addIssue({ code: 'custom', message: '跟进人关联事实冲突' });
  }
}).transform(({ keyword_tenant: _keywordTenant, ...row }) => row);

export const TrialDetailSchema = z.object({
  ...TrialRowObjectSchema.shape,
  tenant: TenantSummarySchema,
  assignee: AssigneeSummarySchema.nullable(),
  events: z.array(EventSchema).max(SERVICE_TRIAL_EVENT_LIMIT),
}).strict().superRefine((row, context) => {
  validateTrialFacts(row, context);
  if (row.tenant.id !== row.tenant_id
    || row.assignee_employee_id !== (row.assignee?.id ?? null)) {
    context.addIssue({ code: 'custom', message: '试用关联事实冲突' });
  }
  row.events.forEach((event, index) => {
    if (event.trial_id !== row.id || event.tenant_id !== row.tenant_id) {
      context.addIssue({ code: 'custom', path: ['events', index], message: '事件归属冲突' });
    }
    const previous = row.events[index - 1];
    if (previous && (previous.occurred_at < event.occurred_at
      || (previous.occurred_at === event.occurred_at && previous.id < event.id))) {
      context.addIssue({ code: 'custom', path: ['events', index], message: '事件顺序无效' });
    }
  });
});

export const TrialSummarySchema = z.object({
  pending_review_count: z.number().int().nonnegative(),
  scheduled_count: z.number().int().nonnegative(),
  current_active_count: z.number().int().nonnegative(),
  expiring_within_7_days_count: z.number().int().nonnegative(),
  month_new_count: z.number().int().nonnegative(),
  month_approved_count: z.number().int().nonnegative(),
  month_converted_count: z.number().int().nonnegative(),
  application_approval_rate: z.number().min(0).max(1),
  activated_cohort_conversion_rate: z.number().min(0).max(1),
  server_time: DateTimeSchema,
}).strict();

export const TrialPolicySchema = z.object({
  id: z.uuid(), is_current: z.literal(true),
  trial_days: z.number().int().min(1).max(365),
  grace_days: z.number().int().min(0).max(30),
  reminder_days: z.array(z.number().int().positive()).min(1).max(10),
  max_trial_days: z.number().int().min(1).max(365),
  max_grace_days: z.number().int().min(0).max(30),
  max_schedule_days: z.number().int().min(0).max(365),
  max_extension_count: z.number().int().min(0).max(20),
  max_extension_days: z.number().int().min(1).max(365),
  reapply_cooldown_days: z.number().int().min(0).max(365),
  allow_repeat: z.boolean(), standard_scope: PlatformServiceTrialScopeSchema,
  guided_scope: PlatformServiceTrialScopeSchema, version: z.number().int().positive(),
  change_reason: z.string().trim().min(1).max(500).nullable(),
  created_at: DateTimeSchema, updated_at: DateTimeSchema,
}).strict().superRefine((policy, context) => {
  if (policy.trial_days > policy.max_trial_days
    || policy.grace_days > policy.max_grace_days
    || new Set(policy.reminder_days).size !== policy.reminder_days.length
    || policy.reminder_days.some((day, index) => day > policy.trial_days
      || index > 0 && policy.reminder_days[index - 1]! <= day)) {
    context.addIssue({ code: 'custom', message: '当前试用策略边界无效' });
  }
});

export const CommandResultSchema = z.object({
  trial_id: z.uuid(), tenant_id: z.uuid(),
  status: z.enum(PLATFORM_SERVICE_TRIAL_STATUS_VALUES),
  version: z.number().int().positive(), idempotent: z.boolean(),
}).strict();
export const AssignResultSchema = CommandResultSchema
  .extend({ assigned: z.boolean() }).strict();

export type TrialRecord = z.infer<typeof TrialRowSchema>;
export type TrialListRecord = z.infer<typeof TrialListRawSchema>;
export type TrialDetailRecord = z.infer<typeof TrialDetailSchema>;
export type TrialSummary = z.infer<typeof TrialSummarySchema>;
export type TrialPolicyRecord = z.infer<typeof TrialPolicySchema>;
export type TrialCommandResult = z.infer<typeof CommandResultSchema>
  | z.infer<typeof AssignResultSchema>;
