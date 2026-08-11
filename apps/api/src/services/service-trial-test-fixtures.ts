import type {
  TrialDetailRecord,
  TrialListRecord,
  TrialPolicyRecord,
  TrialRecord,
} from '@/repositories/service-trials';
import type { PlatformServiceTrialScopeV1 } from '@gooes/domain';

export const TRIAL_ID = '11111111-1111-4111-8111-111111111111';
export const TENANT_ID = '22222222-2222-4222-8222-222222222222';
export const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
export const ASSIGNEE_ID = '44444444-4444-4444-8444-444444444444';
export const IDEMPOTENCY_KEY = '55555555-5555-4555-8555-555555555555';
export const NOW = new Date('2026-08-11T08:00:00.000Z');

export const TEST_SCOPE: PlatformServiceTrialScopeV1 = {
  version: 1,
  capabilities: ['core.projects', 'core.customers'],
};

const policySnapshot = {
  policy_id: '66666666-6666-4666-8666-666666666666',
  version: 1,
  trial_days: 30,
  grace_days: 7,
  max_trial_days: 60,
  max_grace_days: 14,
  max_schedule_days: 30,
  max_extension_count: 1,
  max_extension_days: 30,
  reapply_cooldown_days: 30,
  allow_repeat: false,
  reminder_days: [7, 3, 1],
};

export function makePendingTrial(
  overrides: Partial<TrialRecord> = {},
): TrialRecord {
  return {
    id: TRIAL_ID,
    tenant_id: TENANT_ID,
    source: 'tenant_application',
    trial_type: 'standard',
    status: 'pending_review',
    application_reason: '体验项目协作',
    expected_user_count: 10,
    expected_project_count: 3,
    contact_name: '张经理',
    contact_phone: '13800138000',
    grant_reason: null,
    review_decision: null,
    review_reason: null,
    revoke_reason: null,
    withdraw_reason: null,
    requested_at: '2026-08-10T08:00:00.000Z',
    reviewed_at: null,
    granted_at: null,
    starts_at: null,
    activated_at: null,
    trial_ends_at: null,
    grace_ends_at: null,
    withdrawn_at: null,
    revoked_at: null,
    converted_at: null,
    converted_order_id: null,
    granted_by_employee_id: null,
    reviewed_by_employee_id: null,
    requested_by_employee_id: ACTOR_ID,
    revoked_by_employee_id: null,
    withdrawn_by_employee_id: null,
    assignee_employee_id: null,
    scope_snapshot: TEST_SCOPE,
    policy_snapshot: policySnapshot,
    extension_count: 0,
    version: 1,
    created_at: '2026-08-10T08:00:00.000Z',
    updated_at: '2026-08-10T08:00:00.000Z',
    ...overrides,
  };
}

export function makeActiveTrial(
  overrides: Partial<TrialRecord> = {},
): TrialRecord {
  return makePendingTrial({
    status: 'active',
    review_decision: 'approved',
    review_reason: '符合试用条件',
    reviewed_at: '2026-08-01T08:00:00.000Z',
    granted_at: '2026-08-01T08:00:00.000Z',
    starts_at: '2026-08-01T08:00:00.000Z',
    activated_at: '2026-08-01T08:00:00.000Z',
    trial_ends_at: '2026-08-10T08:00:00.000Z',
    grace_ends_at: '2026-08-17T08:00:00.000Z',
    granted_by_employee_id: ACTOR_ID,
    reviewed_by_employee_id: ACTOR_ID,
    policy_snapshot: { ...policySnapshot, override_used: false },
    version: 2,
    ...overrides,
  });
}

export function makeTrialDetail(
  trial: TrialRecord = makePendingTrial(),
): TrialDetailRecord {
  return {
    ...trial,
    tenant: { id: trial.tenant_id, name: '示例装企', slug: 'example-tenant' },
    assignee: trial.assignee_employee_id
      ? { id: trial.assignee_employee_id, name: '运营小王',
        phone: '13900139000', status: 'active' }
      : null,
    events: [],
  };
}

export function makeTrialListRecord(
  trial: TrialRecord = makePendingTrial(),
): TrialListRecord {
  const detail = makeTrialDetail(trial);
  const { events: _events, ...listRecord } = detail;
  return listRecord;
}

export function makePolicy(
  overrides: Partial<TrialPolicyRecord> = {},
): TrialPolicyRecord {
  return {
    id: policySnapshot.policy_id,
    is_current: true,
    trial_days: 30,
    grace_days: 7,
    reminder_days: [7, 3, 1],
    max_trial_days: 60,
    max_grace_days: 14,
    max_schedule_days: 30,
    max_extension_count: 1,
    max_extension_days: 30,
    reapply_cooldown_days: 30,
    allow_repeat: false,
    standard_scope: TEST_SCOPE,
    guided_scope: TEST_SCOPE,
    version: 1,
    change_reason: null,
    created_at: '2026-08-01T08:00:00.000Z',
    updated_at: '2026-08-01T08:00:00.000Z',
    ...overrides,
  };
}
