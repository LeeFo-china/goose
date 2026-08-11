import type { PlatformServiceTrialStatus } from '@gooes/domain';

import type {
  TrialDetailRecord,
  TrialListRecord,
  TrialPolicyRecord,
  TrialRecord,
  SafeTrialCommandSnapshot,
} from '@/repositories/service-trials';

type ServiceTrialRecord = TrialRecord | TrialListRecord | TrialDetailRecord;
type TrialActionFacts = Pick<TrialRecord,
  'status' | 'starts_at' | 'trial_ends_at' | 'grace_ends_at'>;
type ActionView = { enabled: boolean; disabled_reason: string | null };

const PLATFORM_PERMISSION = {
  review: 'platform.service_trial.review',
  manage: 'platform.service_trial.manage',
  override: 'platform.service_trial.override',
} as const;
const TENANT_APPLY_PERMISSION = 'billing.service_trial.apply';

function disabled(reason: string): ActionView {
  return { enabled: false, disabled_reason: reason };
}

function enabled(): ActionView {
  return { enabled: true, disabled_reason: null };
}

export function resolveServiceTrialEffectiveStatus(
  record: TrialActionFacts,
  now: Date,
): PlatformServiceTrialStatus {
  if (!['scheduled', 'active', 'grace_period'].includes(record.status)
    || !record.starts_at || !record.trial_ends_at || !record.grace_ends_at) {
    return record.status;
  }
  const timestamp = now.getTime();
  if (timestamp < Date.parse(record.starts_at)) return 'scheduled';
  if (timestamp < Date.parse(record.trial_ends_at)) return 'active';
  if (timestamp < Date.parse(record.grace_ends_at)) return 'grace_period';
  return 'expired';
}

export function maskServiceTrialPhone(
  phone: string | null | undefined,
): string | null {
  if (!phone) return null;
  if (!/^1[3-9]\d{9}$/.test(phone)) return null;
  return `${phone.slice(0, 3)}****${phone.slice(7)}`;
}

function maskContactName(name: string | null): string | null {
  if (!name) return null;
  const characters = [...name];
  return characters.length === 1
    ? `${characters[0]}*`
    : `${characters[0]}${'*'.repeat(characters.length - 1)}`;
}

export function serializeServiceTrial(
  record: ServiceTrialRecord,
  now: Date,
) {
  const trial = {
    id: record.id,
    tenant_id: record.tenant_id,
    source: record.source,
    trial_type: record.trial_type,
    status: resolveServiceTrialEffectiveStatus(record, now),
    persisted_status: record.status,
    application_reason: record.application_reason,
    expected_user_count: record.expected_user_count,
    expected_project_count: record.expected_project_count,
    contact_name: maskContactName(record.contact_name),
    contact_phone: maskServiceTrialPhone(record.contact_phone),
    grant_reason: record.grant_reason,
    review_decision: record.review_decision,
    review_reason: record.review_reason,
    revoke_reason: record.revoke_reason,
    withdraw_reason: record.withdraw_reason,
    requested_at: record.requested_at,
    reviewed_at: record.reviewed_at,
    granted_at: record.granted_at,
    starts_at: record.starts_at,
    activated_at: record.activated_at,
    trial_ends_at: record.trial_ends_at,
    grace_ends_at: record.grace_ends_at,
    withdrawn_at: record.withdrawn_at,
    revoked_at: record.revoked_at,
    converted_at: record.converted_at,
    converted_order_id: record.converted_order_id,
    assignee_employee_id: record.assignee_employee_id,
    scope: record.scope_snapshot,
    policy_snapshot: record.policy_snapshot,
    extension_count: record.extension_count,
    version: record.version,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
  return {
    ...trial,
    ...('tenant' in record ? { tenant: record.tenant } : {}),
    ...('assignee' in record ? {
      assignee: record.assignee ? {
        id: record.assignee.id,
        name: record.assignee.name,
        phone: maskServiceTrialPhone(record.assignee.phone),
        status: record.assignee.status,
      } : null,
    } : {}),
    ...('events' in record ? {
      events: record.events.map((event) => ({
        id: event.id,
        event_type: event.event_type,
        from_status: event.from_status,
        to_status: event.to_status,
        reason: event.reason,
        occurred_at: event.occurred_at,
      })),
    } : {}),
  };
}

export function serializeServiceTrialPolicy(record: TrialPolicyRecord) {
  return {
    id: record.id,
    trial_days: record.trial_days,
    grace_days: record.grace_days,
    reminder_days: record.reminder_days,
    max_trial_days: record.max_trial_days,
    max_grace_days: record.max_grace_days,
    max_schedule_days: record.max_schedule_days,
    max_extension_count: record.max_extension_count,
    max_extension_days: record.max_extension_days,
    reapply_cooldown_days: record.reapply_cooldown_days,
    allow_repeat: record.allow_repeat,
    standard_scope: record.standard_scope,
    guided_scope: record.guided_scope,
    version: record.version,
    change_reason: record.change_reason,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export function serializeServiceTrialCommandSnapshot(
  snapshot: SafeTrialCommandSnapshot,
) {
  return {
    id: snapshot.id,
    tenant_id: snapshot.tenant_id,
    source: snapshot.source,
    trial_type: snapshot.trial_type,
    status: snapshot.status,
    persisted_status: snapshot.status,
    application_reason: null,
    expected_user_count: snapshot.expected_user_count,
    expected_project_count: snapshot.expected_project_count,
    contact_name: snapshot.contact_name_masked,
    contact_phone: snapshot.contact_phone_masked,
    grant_reason: null,
    review_decision: snapshot.review_decision,
    review_reason: null,
    revoke_reason: null,
    withdraw_reason: null,
    requested_at: snapshot.requested_at,
    reviewed_at: snapshot.reviewed_at,
    granted_at: snapshot.granted_at,
    starts_at: snapshot.starts_at,
    activated_at: snapshot.activated_at,
    trial_ends_at: snapshot.trial_ends_at,
    grace_ends_at: snapshot.grace_ends_at,
    withdrawn_at: snapshot.withdrawn_at,
    revoked_at: snapshot.revoked_at,
    converted_at: snapshot.converted_at,
    converted_order_id: snapshot.converted_order_id,
    assignee_employee_id: null,
    scope: snapshot.scope,
    policy_snapshot: snapshot.policy_snapshot,
    extension_count: snapshot.extension_count,
    version: snapshot.version,
    created_at: snapshot.created_at,
    updated_at: snapshot.updated_at,
  };
}

export function buildTrialAvailableActions(
  record: TrialActionFacts,
  permissions: ReadonlySet<string>,
  now: Date,
) {
  const status = resolveServiceTrialEffectiveStatus(record, now);
  const has = (permission: string) => permissions.has(permission);
  const hasManageOverride = has(PLATFORM_PERMISSION.manage)
    && has(PLATFORM_PERMISSION.override);
  return {
    withdraw: !has(TENANT_APPLY_PERMISSION)
      ? disabled('无试用申请权限')
      : status === 'pending_review' ? enabled() : disabled('当前状态不可撤回'),
    review: !has(PLATFORM_PERMISSION.review)
      ? disabled('无试用审核权限')
      : status === 'pending_review' ? enabled() : disabled('当前状态不可审核'),
    extend: !hasManageOverride
      ? disabled('无试用延期权限')
      : ['active', 'grace_period'].includes(status)
        ? enabled() : disabled('当前状态不可延期'),
    revoke: !hasManageOverride
      ? disabled('无试用撤销权限')
      : ['scheduled', 'active', 'grace_period'].includes(status)
        ? enabled() : disabled('当前状态不可撤销'),
    assign: !has(PLATFORM_PERMISSION.manage)
      ? disabled('无跟进人分配权限')
      : ['scheduled', 'active', 'grace_period'].includes(status)
        ? enabled() : disabled('当前状态不可分配跟进人'),
    purchase: status === 'converted'
      ? disabled('试用已转为正式服务') : enabled(),
  };
}
