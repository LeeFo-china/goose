import { beforeAll, describe, expect, mock, test } from 'bun:test';

import type { TrialCommandInput } from '@/repositories/service-trials';
import type { CreateServiceTrialFollowUpInput } from '@/schema/service-trial-followups';
import type { AuthContext } from '@/services/authorization';
import {
  ACTOR_ID,
  ASSIGNEE_ID,
  IDEMPOTENCY_KEY,
  makeActiveTrial,
  makeCommandSnapshot,
  makeTrialDetail,
  makePolicy,
  NOW,
  TENANT_ID,
  TRIAL_ID,
} from './service-trial-test-fixtures';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

let PlatformServiceTrialService:
  typeof import('./platform-service-trials').PlatformServiceTrialService;

beforeAll(async () => {
  ({ PlatformServiceTrialService } = await import('./platform-service-trials'));
});

const authContext = {
  tenantId: null, employeeId: ACTOR_ID,
  isPlatformStaff: true, isPlatformAdmin: false, isPlatformSuperAdmin: false,
  permissions: [
    { code: 'platform.service_trial.review', scope: 'all' },
    { code: 'platform.service_trial.manage', scope: 'all' },
  ],
} as unknown as AuthContext;

const initialFollowUp = {
  id: IDEMPOTENCY_KEY, trial_id: TRIAL_ID, tenant_id: TENANT_ID,
  follow_up_type: 'online_meeting' as const, status: 'pending' as const,
  summary: '陪跑试用首次跟进', result: '待与租户确认首次陪跑安排',
  next_follow_up_at: NOW.toISOString(), created_by_employee_id: ACTOR_ID,
  created_at: NOW.toISOString(), idempotent: false,
};

function createDependencies() {
  const trial = makeActiveTrial({
    trial_type: 'guided', assignee_employee_id: ASSIGNEE_ID,
    starts_at: NOW.toISOString(),
  });
  const repository = {
    listPlatformTrials: mock(async () => ({
      list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })),
    getPlatformSummary: mock(async () => ({
      pending_review_count: 0, scheduled_count: 0, current_active_count: 1,
      expiring_within_7_days_count: 0, month_new_count: 0,
      month_approved_count: 0, month_converted_count: 0,
      application_approval_rate: 0, activated_cohort_conversion_rate: 0,
      server_time: NOW.toISOString(),
    })),
    findTrialById: mock(async () => makeTrialDetail(trial)),
    findCurrentPolicy: mock(async () => makePolicy()),
    findPolicyById: mock(async () => makePolicy()),
    executeCommand: mock(async (input: TrialCommandInput) => ({
      trial_id: 'trialId' in input ? input.trialId : TRIAL_ID,
      tenant_id: TENANT_ID, status: trial.status, version: trial.version,
      trial_snapshot: makeCommandSnapshot(trial), idempotent: false,
    })),
    updatePolicy: mock(async () => ({
      policy_id: makePolicy().id, version: 1, is_current: true as const,
      idempotent: false,
    })),
  };
  const operationsService = {
    listFollowUps: mock(async () => ({
      list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })),
    createFollowUp: mock(async (_authContext: AuthContext, _trialId: string,
      _input: CreateServiceTrialFollowUpInput) => initialFollowUp),
    cancelFollowUp: mock(async () => ({
      ...initialFollowUp, status: 'canceled' as const,
    })),
  };
  return { repository, operationsService };
}

describe('guided trial initial follow-up', () => {
  test.each([
    ['grant', async (service: InstanceType<typeof PlatformServiceTrialService>) =>
      service.grant(authContext, {
        tenant_id: TENANT_ID, trial_type: 'guided',
        assignee_employee_id: ASSIGNEE_ID, reason: '陪跑开通',
        idempotency_key: IDEMPOTENCY_KEY,
      })],
    ['review', async (service: InstanceType<typeof PlatformServiceTrialService>) =>
      service.review(authContext, TRIAL_ID, {
        decision: 'approved', trial_type: 'guided',
        assignee_employee_id: ASSIGNEE_ID, expected_version: 1,
        reason: '陪跑批准', idempotency_key: IDEMPOTENCY_KEY,
      })],
  ] as const)('creates a stable pending task after guided %s', async (_name, run) => {
    const dependencies = createDependencies();
    const service = new PlatformServiceTrialService(dependencies);
    await run(service);
    expect(dependencies.operationsService.createFollowUp).toHaveBeenCalledWith(
      authContext, TRIAL_ID, {
        follow_up_type: 'online_meeting', status: 'pending',
        summary: '陪跑试用首次跟进', result: '待与租户确认首次陪跑安排',
        next_follow_up_at: NOW.toISOString(), idempotency_key: IDEMPOTENCY_KEY,
      },
    );
  });

  test('retries the initial task with the original command key after an uncertain failure', async () => {
    const dependencies = createDependencies();
    let shouldFail = true;
    dependencies.operationsService.createFollowUp.mockImplementation(async (
      _authContext, _trialId, _input,
    ) => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error('uncertain follow-up response');
      }
      return initialFollowUp;
    });
    const service = new PlatformServiceTrialService(dependencies);
    const input = {
      tenant_id: TENANT_ID, trial_type: 'guided' as const,
      assignee_employee_id: ASSIGNEE_ID, reason: '陪跑开通',
      idempotency_key: IDEMPOTENCY_KEY,
    };

    await expect(service.grant(authContext, input)).rejects.toThrow(
      'uncertain follow-up response',
    );
    await service.grant(authContext, input);

    expect(dependencies.repository.executeCommand).toHaveBeenCalledTimes(2);
    expect(dependencies.operationsService.createFollowUp).toHaveBeenCalledTimes(2);
    expect(dependencies.operationsService.createFollowUp.mock.calls[1]?.[2])
      .toMatchObject({ idempotency_key: IDEMPOTENCY_KEY });
  });
});
