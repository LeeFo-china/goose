import { describe, expect, test } from 'bun:test';

import { TrialRowSchema } from './service-trial-records';

const actorId = '44444444-4444-4444-8444-444444444444';
const policySnapshot = {
  policy_id: '99999999-9999-4999-8999-999999999999', version: 1,
  trial_days: 30, grace_days: 23, max_trial_days: 60, max_grace_days: 14,
  max_schedule_days: 30, max_extension_count: 1, max_extension_days: 30,
  reapply_cooldown_days: 30, allow_repeat: false,
  reminder_days: [7, 3, 1], override_used: true,
};
const overrideTrial = {
  id: '11111111-1111-4111-8111-111111111111',
  tenant_id: '22222222-2222-4222-8222-222222222222',
  source: 'platform_grant', trial_type: 'standard', status: 'grace_period',
  application_reason: null, expected_user_count: null, expected_project_count: null,
  contact_name: null, contact_phone: null, grant_reason: '开发验收特批',
  review_decision: null, review_reason: null, revoke_reason: null,
  withdraw_reason: null, requested_at: null, reviewed_at: null,
  granted_at: '2026-08-10T08:00:00.000Z',
  starts_at: '2026-07-10T08:00:00.000Z',
  activated_at: '2026-07-10T08:00:00.000Z',
  trial_ends_at: '2026-08-09T08:00:00.000Z',
  grace_ends_at: '2026-09-01T08:00:00.000Z',
  withdrawn_at: null, revoked_at: null, converted_at: null,
  converted_order_id: null, granted_by_employee_id: actorId,
  reviewed_by_employee_id: null, requested_by_employee_id: null,
  revoked_by_employee_id: null, withdrawn_by_employee_id: null,
  assignee_employee_id: null,
  scope_snapshot: { version: 1, capabilities: ['core.projects'] },
  policy_snapshot: policySnapshot, extension_count: 0, version: 1,
  created_at: '2026-08-10T08:00:00.000Z',
  updated_at: '2026-08-10T08:00:00.000Z',
};

describe('service trial override policy snapshot', () => {
  test('accepts a hard-limit-safe override beyond the ordinary policy maximum', () => {
    expect(TrialRowSchema.safeParse(overrideTrial).success).toBe(true);
  });

  test('still rejects the same policy excess without an override fact', () => {
    const regular = {
      ...overrideTrial,
      policy_snapshot: { ...policySnapshot, override_used: false },
    };
    expect(TrialRowSchema.safeParse(regular).success).toBe(false);
  });
});
