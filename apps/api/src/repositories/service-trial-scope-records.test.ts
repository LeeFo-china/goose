import { describe, expect, test } from 'bun:test';
import { PLATFORM_SERVICE_TRIAL_FULL_SCOPE } from '@gooes/domain';
import { CommandResultSchema, TrialDetailSchema } from './service-trial-records';
import {
  ACTOR_ID, IDEMPOTENCY_KEY, makeActiveTrial, makeCommandSnapshot,
  makeTrialDetail, NOW, TEST_SCOPE,
} from '@/services/service-trial-test-fixtures';

describe('scope update database response contracts', () => {
  const trial = makeActiveTrial({ scope_snapshot: PLATFORM_SERVICE_TRIAL_FULL_SCOPE, version: 3 });
  const event = {
    id: IDEMPOTENCY_KEY, tenant_id: trial.tenant_id, trial_id: trial.id,
    event_key: 'update-scope:3', event_type: 'trial_scope_updated',
    from_status: 'active', to_status: 'active', reason: '调整范围',
    actor_employee_id: ACTOR_ID,
    metadata: { before_scope: TEST_SCOPE, after_scope: PLATFORM_SERVICE_TRIAL_FULL_SCOPE },
    occurred_at: NOW.toISOString(), created_at: NOW.toISOString(),
  };

  test('accepts the saved thirteen-capability command response', () => {
    const result = {
      trial_id: trial.id, tenant_id: trial.tenant_id, status: trial.status,
      version: 3, trial_snapshot: makeCommandSnapshot(trial), idempotent: true,
    };
    expect(CommandResultSchema.parse(result)).toEqual(result);
  });

  test('accepts the scope update audit event in trial detail', () => {
    const detail = { ...makeTrialDetail(trial), events: [event] };
    const result = TrialDetailSchema.safeParse(detail);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.events[0]?.metadata).toEqual(event.metadata);
  });

  test('continues rejecting unknown audit types and cross-tenant events', () => {
    for (const patch of [{ event_type: 'unknown' }, { tenant_id: ACTOR_ID }]) {
      expect(TrialDetailSchema.safeParse({
        ...makeTrialDetail(trial), events: [{ ...event, ...patch }],
      }).success).toBe(false);
    }
  });
});
