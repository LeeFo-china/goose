import { beforeAll, describe, expect, mock, test } from 'bun:test';
import type { AuthContext } from './authorization';
import type { TrialCommandInput } from '@/repositories/service-trials';
import { buildTrialAvailableActions } from './service-trial-views';
import {
  ACTOR_ID, IDEMPOTENCY_KEY, makeActiveTrial, makeCommandSnapshot,
  makePolicy, makeTrialDetail, NOW, TENANT_ID, TEST_SCOPE, TRIAL_ID,
} from './service-trial-test-fixtures';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
let PlatformServiceTrialService:
  typeof import('./platform-service-trials').PlatformServiceTrialService;
beforeAll(async () => {
  ({ PlatformServiceTrialService } = await import('./platform-service-trials'));
});
const MANAGE = 'platform.service_trial.manage';
function auth(codes: string[] = [MANAGE]): AuthContext {
  return {
    authUserId: 'platform-auth', employeeId: ACTOR_ID, tenantId: null,
    tenantName: null, tenantSlug: null, tenantStatus: null,
    isPlatformAdmin: false, isPlatformStaff: true, isPlatformSuperAdmin: false,
    adminAuthVersion: 1, employeeName: '运营', employeeStatus: 'active',
    departmentId: null, tenantDepartmentId: null, departmentCode: null,
    departmentName: null, postId: null, postName: null, avatar: null,
    roleCodes: ['platform_staff'], roles: [],
    permissions: codes.map((code) => ({ code, scope: 'all' })),
  };
}
const input = {
  scope: TEST_SCOPE, expected_version: 2,
  idempotency_key: IDEMPOTENCY_KEY, reason: '调整业务范围',
};
function harness(idempotent = false) {
  const saved = makeActiveTrial({ version: 3, extension_count: 1 });
  const repository = {
    listPlatformTrials: mock(async () => ({ list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } })),
    getPlatformSummary: mock(async () => { throw new TypeError('unexpected summary'); }),
    findTrialById: mock(async () => makeTrialDetail(saved)),
    findCurrentPolicy: mock(async () => makePolicy()),
    findPolicyById: mock(async () => makePolicy()),
    updatePolicy: mock(async () => { throw new TypeError('unexpected policy update'); }),
    executeCommand: mock(async (_command: TrialCommandInput) => ({
      trial_id: TRIAL_ID, tenant_id: TENANT_ID, status: saved.status,
      version: saved.version, trial_snapshot: makeCommandSnapshot(saved), idempotent,
    })),
  };
  return { saved, repository, service: new PlatformServiceTrialService({
    repository, nowFactory: () => new Date(NOW),
  }) };
}

describe('platform scope updates', () => {
  test.each([false, true])('uses manage only and saved command response (replay=%s)', async (replay) => {
    const { service, repository, saved } = harness(replay);
    expect(typeof service.updateScope).toBe('function');
    const result = await service.updateScope(auth(), TRIAL_ID, input);
    expect(repository.executeCommand).toHaveBeenCalledWith({
      action: 'update_scope', trialId: TRIAL_ID, actorEmployeeId: ACTOR_ID,
      scope: TEST_SCOPE, expectedVersion: 2, idempotencyKey: IDEMPOTENCY_KEY,
      reason: input.reason,
    });
    expect(result).toMatchObject({
      trial: { id: TRIAL_ID, version: 3, scope: TEST_SCOPE,
        starts_at: saved.starts_at, trial_ends_at: saved.trial_ends_at,
        grace_ends_at: saved.grace_ends_at, extension_count: 1 },
      idempotent: replay, server_time: NOW.toISOString(),
      available_actions: { update_scope: { enabled: true, disabled_reason: null } },
    });
    expect(repository.findTrialById).not.toHaveBeenCalled();
    expect(repository.findCurrentPolicy).not.toHaveBeenCalled();
  });

  test.each([[], ['platform.service_trial.read'], ['platform.service_trial.override']].map((codes) => ({ codes })))(
    'requires manage before a command for $codes', async ({ codes }) => {
      const { service, repository } = harness();
      expect(typeof service.updateScope).toBe('function');
      await expect(service.updateScope(auth(codes), TRIAL_ID, input)).rejects.toMatchObject({
        statusCode: 403, code: 'PLATFORM_PERMISSION_REQUIRED', details: { permission: MANAGE },
      });
      expect(repository.executeCommand).not.toHaveBeenCalled();
    },
  );

  test.each([
    { tenantId: TENANT_ID }, { employeeId: null },
    { isPlatformStaff: false, isPlatformAdmin: false },
  ])('rejects invalid platform context %j', async (patch) => {
    const { service, repository } = harness();
    expect(typeof service.updateScope).toBe('function');
    await expect(service.updateScope({ ...auth(), ...patch }, TRIAL_ID, input))
      .rejects.toMatchObject({ statusCode: 403, code: 'PLATFORM_STAFF_REQUIRED' });
    expect(repository.executeCommand).not.toHaveBeenCalled();
  });

  test.each([
    ['2026-08-01T07:59:59.999Z', true],
    ['2026-08-01T08:00:00.000Z', true],
    ['2026-08-10T08:00:00.000Z', true],
    ['2026-08-17T07:59:59.999Z', true],
    ['2026-08-17T08:00:00.000Z', false],
  ] as const)('derives availability from the effective clock at %s', (now, enabled) => {
    expect(buildTrialAvailableActions(makeActiveTrial(), new Set([MANAGE]), new Date(now)))
      .toHaveProperty('update_scope.enabled', enabled);
  });

  test.each(['pending_review', 'expired', 'rejected', 'withdrawn', 'revoked', 'converted'] as const)(
    'does not permit editing %s even while the old time window is open', (status) => {
      expect(buildTrialAvailableActions(makeActiveTrial({ status }), new Set([MANAGE]), NOW))
        .toHaveProperty('update_scope.enabled', false);
    },
  );

  test('read or override permission alone does not expose editing', () => {
    for (const codes of [[], ['platform.service_trial.read'], ['platform.service_trial.override']]) {
      expect(buildTrialAvailableActions(makeActiveTrial(), new Set(codes), NOW))
        .toHaveProperty('update_scope.enabled', false);
    }
  });
});
