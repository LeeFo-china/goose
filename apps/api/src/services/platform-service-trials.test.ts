import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import { Errors } from '@/errors/error-factory';
import type {
  TrialCommandInput,
  TrialPolicyUpdateCommand,
} from '@/repositories/service-trials';
import type { AuthContext } from '@/services/authorization';
import {
  ACTOR_ID,
  ASSIGNEE_ID,
  IDEMPOTENCY_KEY,
  makeActiveTrial,
  makePendingTrial,
  makePolicy,
  makeTrialDetail,
  makeTrialListRecord,
  NOW,
  TENANT_ID,
  TEST_SCOPE,
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

const PERMISSION = {
  read: 'platform.service_trial.read',
  review: 'platform.service_trial.review',
  manage: 'platform.service_trial.manage',
  override: 'platform.service_trial.override',
} as const;

function platformAuth(permissionCodes: readonly string[]): AuthContext {
  return {
    authUserId: 'auth-platform', employeeId: ACTOR_ID, tenantId: null,
    tenantName: null, tenantSlug: null, tenantStatus: null,
    isPlatformAdmin: false, isPlatformStaff: true,
    isPlatformSuperAdmin: false, adminAuthVersion: 1,
    employeeName: '平台运营', employeeStatus: 'active', departmentId: null,
    tenantDepartmentId: null, departmentCode: null, departmentName: null,
    postId: null, postName: null, avatar: null, roleCodes: ['platform_staff'],
    roles: [],
    permissions: permissionCodes.map((code) => ({ code, scope: 'all' })),
  };
}

function createRepository() {
  return {
    listPlatformTrials: mock(async () => ({
      list: [makeTrialListRecord()],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    })),
    getPlatformSummary: mock(async (serverTime: string) => ({
      pending_review_count: 1, scheduled_count: 0, current_active_count: 2,
      expiring_within_7_days_count: 1, month_new_count: 3,
      month_approved_count: 2, month_converted_count: 1,
      application_approval_rate: 0.5, activated_cohort_conversion_rate: 0.25,
      server_time: serverTime,
    })),
    findTrialById: mock(async () => makeTrialDetail(makeActiveTrial())),
    findCurrentPolicy: mock(async () => makePolicy()),
    executeCommand: mock(async (input: TrialCommandInput) => ({
      trial_id: 'trialId' in input ? input.trialId : TRIAL_ID,
      tenant_id: TENANT_ID,
      status: input.action === 'review' && input.decision === 'rejected'
        ? 'rejected' : 'active',
      version: 2,
      idempotent: false,
      ...(input.action === 'assign'
        ? { assigned: input.assigneeEmployeeId !== null } : {}),
    } as const)),
    updatePolicy: mock(async (_input: TrialPolicyUpdateCommand) => ({
      policy_id: makePolicy().id, version: 2, is_current: true,
      idempotent: false,
    } as const)),
  };
}

const approvedReview = {
  decision: 'approved' as const,
  expected_version: 1,
  idempotency_key: IDEMPOTENCY_KEY,
  reason: '符合试用条件',
  trial_type: 'standard' as const,
  trial_days: 30,
  grace_days: 7,
};

describe('PlatformServiceTrialService reads', () => {
  let repository: ReturnType<typeof createRepository>;
  let service: InstanceType<typeof PlatformServiceTrialService>;

  beforeEach(() => {
    repository = createRepository();
    service = new PlatformServiceTrialService({
      repository, nowFactory: () => new Date(NOW),
    });
  });

  test('requires read permission and a real platform staff context', async () => {
    await expect(service.listTrials(platformAuth([]), {})).rejects.toMatchObject({
      statusCode: 403, code: 'PLATFORM_PERMISSION_REQUIRED',
    });
    await expect(service.listTrials({
      ...platformAuth([PERMISSION.read]), tenantId: TENANT_ID,
    }, {})).rejects.toMatchObject({
      statusCode: 403, code: 'PLATFORM_STAFF_REQUIRED',
    });
    expect(repository.listPlatformTrials).not.toHaveBeenCalled();
  });

  test('serializes a page in one repository call without PII leakage or N+1', async () => {
    const result = await service.listTrials(platformAuth([PERMISSION.read]), {
      page: 1, pageSize: 20, status: 'pending_review',
    });

    expect(repository.listPlatformTrials).toHaveBeenCalledTimes(1);
    expect(repository.findTrialById).not.toHaveBeenCalled();
    expect(repository.findCurrentPolicy).not.toHaveBeenCalled();
    expect(result.server_time).toBe(NOW.toISOString());
    expect(result.list[0]).toMatchObject({
      contact_name: '张**', contact_phone: '138****8000',
      available_actions: {
        review: { enabled: false, disabled_reason: '无试用审核权限' },
      },
    });
    expect(JSON.stringify(result)).not.toContain('13800138000');
  });

  test('uses the injected clock for summary and detail responses', async () => {
    const auth = platformAuth([PERMISSION.read]);
    const summary = await service.getSummary(auth);
    const detail = await service.getTrial(auth, TRIAL_ID);

    expect(repository.getPlatformSummary).toHaveBeenCalledWith(NOW.toISOString());
    expect(summary.server_time).toBe(NOW.toISOString());
    expect(detail.server_time).toBe(NOW.toISOString());
    expect(detail.trial.status).toBe('grace_period');
  });

  test('returns a strict current policy view with permission-aware update action', async () => {
    const readOnly = await service.getPolicy(platformAuth([PERMISSION.read]));
    const privileged = await service.getPolicy(platformAuth([
      PERMISSION.read, PERMISSION.manage, PERMISSION.override,
    ]));

    expect(readOnly).toMatchObject({
      policy: { trial_days: 30, grace_days: 7, version: 1 },
      available_actions: {
        update_policy: {
          enabled: false,
          disabled_reason: '无试用策略修改权限',
        },
      },
      server_time: NOW.toISOString(),
    });
    expect(privileged.available_actions.update_policy).toEqual({
      enabled: true,
      disabled_reason: null,
    });
  });
});

describe('PlatformServiceTrialService permission matrix', () => {
  let repository: ReturnType<typeof createRepository>;
  let service: InstanceType<typeof PlatformServiceTrialService>;

  beforeEach(() => {
    repository = createRepository();
    service = new PlatformServiceTrialService({
      repository, nowFactory: () => new Date(NOW),
    });
  });

  test.each([
    {
      name: 'ordinary standard review', permissions: [PERMISSION.review],
      input: approvedReview, allowOverride: false,
    },
    {
      name: 'guided review', permissions: [PERMISSION.review, PERMISSION.manage],
      input: { ...approvedReview, trial_type: 'guided' as const,
        assignee_employee_id: ASSIGNEE_ID }, allowOverride: false,
    },
    {
      name: 'out-of-policy standard review',
      permissions: [PERMISSION.review, PERMISSION.override],
      input: { ...approvedReview, trial_days: 61 }, allowOverride: true,
    },
    {
      name: 'out-of-policy guided review',
      permissions: [PERMISSION.review, PERMISSION.manage, PERMISSION.override],
      input: { ...approvedReview, trial_type: 'guided' as const,
        assignee_employee_id: ASSIGNEE_ID, grace_days: 15 },
      allowOverride: true,
    },
  ])('allows $name with the exact AND permissions', async ({
    permissions, input, allowOverride,
  }) => {
    await service.review(platformAuth(permissions), TRIAL_ID, input);
    expect(repository.executeCommand.mock.calls[0]![0]).toMatchObject({
      action: 'review', trialId: TRIAL_ID, actorEmployeeId: ACTOR_ID,
      scope: TEST_SCOPE, allowOverride,
    });
  });

  test.each([
    {
      name: 'guided without manage', permissions: [PERMISSION.review],
      input: { ...approvedReview, trial_type: 'guided' as const,
        assignee_employee_id: ASSIGNEE_ID }, missing: PERMISSION.manage,
    },
    {
      name: 'assignee without manage', permissions: [PERMISSION.review],
      input: { ...approvedReview, assignee_employee_id: ASSIGNEE_ID },
      missing: PERMISSION.manage,
    },
    {
      name: 'out-of-policy without override', permissions: [PERMISSION.review],
      input: { ...approvedReview, trial_days: 61 }, missing: PERMISSION.override,
    },
    {
      name: 'out-of-policy guided without override',
      permissions: [PERMISSION.review, PERMISSION.manage],
      input: { ...approvedReview, trial_type: 'guided' as const,
        assignee_employee_id: ASSIGNEE_ID, grace_days: 15 },
      missing: PERMISSION.override,
    },
  ])('rejects $name before the command', async ({ permissions, input, missing }) => {
    await expect(service.review(platformAuth(permissions), TRIAL_ID, input))
      .rejects.toMatchObject({
        statusCode: 403, code: 'PLATFORM_PERMISSION_REQUIRED',
        details: { permission: missing },
      });
    expect(repository.executeCommand).not.toHaveBeenCalled();
  });

  test('rejects an application with review permission only', async () => {
    repository.findTrialById.mockImplementationOnce(async () => makeTrialDetail(
      makePendingTrial({
        status: 'rejected', review_decision: 'rejected',
        review_reason: '目标不清晰', reviewed_at: NOW.toISOString(),
        reviewed_by_employee_id: ACTOR_ID, version: 2,
      }),
    ));
    await service.review(platformAuth([PERMISSION.review]), TRIAL_ID, {
      decision: 'rejected', expected_version: 1,
      idempotency_key: IDEMPOTENCY_KEY, reason: '目标不清晰',
    });
    expect(repository.executeCommand).toHaveBeenCalledWith({
      action: 'review', trialId: TRIAL_ID, actorEmployeeId: ACTOR_ID,
      decision: 'rejected', expectedVersion: 1,
      idempotencyKey: IDEMPOTENCY_KEY, reason: '目标不清晰',
      allowOverride: false,
    });
  });

  test('uses manage for ordinary grants and defaults scope from policy', async () => {
    await service.grant(platformAuth([PERMISSION.manage]), {
      tenant_id: TENANT_ID, trial_type: 'standard', reason: '重点租户评估',
      idempotency_key: IDEMPOTENCY_KEY,
    });
    expect(repository.executeCommand).toHaveBeenCalledWith({
      action: 'grant', tenantId: TENANT_ID, actorEmployeeId: ACTOR_ID,
      trialType: 'standard', scope: TEST_SCOPE, reason: '重点租户评估',
      idempotencyKey: IDEMPOTENCY_KEY, allowOverride: false,
    });
  });

  test('retries only a repeat grant with manage plus override', async () => {
    repository.executeCommand
      .mockImplementationOnce(async () => {
        throw Errors.business(403, '重复试用需要平台特批',
          'SERVICE_TRIAL_REPEAT_REQUIRES_OVERRIDE');
      })
      .mockImplementationOnce(async () => ({
        trial_id: TRIAL_ID, tenant_id: TENANT_ID, status: 'active',
        version: 2, idempotent: false,
      }));
    await service.grant(platformAuth([PERMISSION.manage, PERMISSION.override]), {
      tenant_id: TENANT_ID, trial_type: 'standard', reason: '再次评估有明确目标',
      idempotency_key: IDEMPOTENCY_KEY,
    });
    expect(repository.executeCommand).toHaveBeenCalledTimes(2);
    expect(repository.executeCommand.mock.calls.map(([input]) =>
      input.action === 'grant' && input.allowOverride)).toEqual([false, true]);
  });

  test('does not convert repeat errors into override for manage-only callers', async () => {
    repository.executeCommand.mockImplementationOnce(async () => {
      throw Errors.business(403, '重复试用需要平台特批',
        'SERVICE_TRIAL_REPEAT_REQUIRES_OVERRIDE');
    });
    await expect(service.grant(platformAuth([PERMISSION.manage]), {
      tenant_id: TENANT_ID, trial_type: 'standard', reason: '再次评估',
      idempotency_key: IDEMPOTENCY_KEY,
    })).rejects.toMatchObject({ code: 'SERVICE_TRIAL_REPEAT_REQUIRES_OVERRIDE' });
    expect(repository.executeCommand).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['extend', [PERMISSION.manage, PERMISSION.override]],
    ['revoke', [PERMISSION.manage, PERMISSION.override]],
    ['assign', [PERMISSION.manage]],
  ] as const)('executes %s with the exact actor from auth', async (action, permissions) => {
    if (action === 'extend') {
      await service.extend(platformAuth([...permissions]), TRIAL_ID, {
        extension_days: 15, expected_version: 2,
        idempotency_key: IDEMPOTENCY_KEY, reason: '继续评估',
      });
    } else if (action === 'revoke') {
      await service.revoke(platformAuth([...permissions]), TRIAL_ID, {
        expected_version: 2, idempotency_key: IDEMPOTENCY_KEY,
        reason: '提前终止',
      });
    } else {
      await service.assign(platformAuth([...permissions]), TRIAL_ID, {
        assignee_employee_id: ASSIGNEE_ID, expected_version: 2,
        idempotency_key: IDEMPOTENCY_KEY,
      });
    }
    expect(repository.executeCommand.mock.calls.at(-1)![0]).toMatchObject({
      action, trialId: TRIAL_ID, actorEmployeeId: ACTOR_ID,
    });
  });

  test('marks extension policy bypass only when snapshot limits are exceeded', async () => {
    await service.extend(platformAuth([PERMISSION.manage, PERMISSION.override]),
      TRIAL_ID, { extension_days: 31, expected_version: 2,
        idempotency_key: IDEMPOTENCY_KEY, reason: '例外延期' });
    expect(repository.executeCommand.mock.calls[0]![0]).toMatchObject({
      action: 'extend', allowOverride: true,
    });
  });

  test('updates the complete policy with manage plus override only', async () => {
    repository.findCurrentPolicy.mockImplementationOnce(async () =>
      makePolicy({ version: 2, change_reason: '更新默认规则' }));
    const input = {
      default_trial_days: 30, default_grace_days: 7,
      reminder_days: [7, 3, 1], max_trial_days: 60,
      max_grace_days: 14, max_schedule_ahead_days: 30,
      max_extension_count: 1, max_extension_days: 30,
      reapply_cooldown_days: 30, allow_repeat_application: false,
      standard_scope: TEST_SCOPE, guided_scope: TEST_SCOPE,
      expected_version: 1, idempotency_key: IDEMPOTENCY_KEY,
      reason: '更新默认规则',
    };
    const result = await service.updatePolicy(
      platformAuth([PERMISSION.manage, PERMISSION.override]), input,
    );
    expect(repository.updatePolicy.mock.calls[0]![0]).toMatchObject({
      actorEmployeeId: ACTOR_ID, expectedVersion: 1,
      idempotencyKey: IDEMPOTENCY_KEY, reason: '更新默认规则',
      policy: { trialDays: 30, maxScheduleDays: 30, allowRepeat: false },
    });
    expect(result.policy.version).toBe(2);
    expect(result.idempotent).toBe(false);
    expect(result.server_time).toBe(NOW.toISOString());
  });
});
