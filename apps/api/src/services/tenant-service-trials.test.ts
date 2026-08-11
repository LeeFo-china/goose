import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import { Errors } from '@/errors/error-factory';
import type {
  TrialCommandInput,
  TrialCommandResult,
  TrialDetailRecord,
} from '@/repositories/service-trials';
import type { AuthContext } from '@/services/authorization';
import {
  ACTOR_ID,
  IDEMPOTENCY_KEY,
  makeActiveTrial,
  makeCommandSnapshot,
  makePendingTrial,
  makeTrialDetail,
  NOW,
  TENANT_ID,
  TRIAL_ID,
} from './service-trial-test-fixtures';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

let TenantServiceTrialService:
  typeof import('./tenant-service-trials').TenantServiceTrialService;
beforeAll(async () => {
  ({ TenantServiceTrialService } = await import('./tenant-service-trials'));
});

function tenantAuth(permissionCodes: string[]): AuthContext {
  return {
    authUserId: 'auth-tenant', employeeId: ACTOR_ID, tenantId: TENANT_ID,
    tenantName: '示例装企', tenantSlug: 'example-tenant', tenantStatus: 'active',
    isPlatformAdmin: false, employeeName: '租户员工', employeeStatus: 'active',
    departmentId: null, tenantDepartmentId: null, departmentCode: null,
    departmentName: null, postId: null, postName: null, avatar: null,
    roleCodes: [], roles: [],
    permissions: permissionCodes.map((code) => ({ code, scope: 'all' })),
  };
}

function createRepository() {
  return {
    listTenantTrials: mock(async () => ({
      list: [makePendingTrial()],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    })),
    findCurrentTenantTrial: mock(async () => makePendingTrial()),
    findTrialById: mock(async (): Promise<TrialDetailRecord | null> =>
      makeTrialDetail()),
    executeCommand: mock(async (
      input: TrialCommandInput,
    ): Promise<TrialCommandResult> => {
      const trial = input.action === 'withdraw'
        ? makePendingTrial({
          status: 'withdrawn', withdrawn_at: NOW.toISOString(),
          withdrawn_by_employee_id: ACTOR_ID, withdraw_reason: input.reason,
          version: 2,
        })
        : makePendingTrial();
      return {
        trial_id: 'trialId' in input ? input.trialId : TRIAL_ID,
        tenant_id: TENANT_ID,
        status: trial.status,
        version: trial.version,
        trial_snapshot: makeCommandSnapshot(trial),
        idempotent: false,
      };
    }),
  };
}

describe('TenantServiceTrialService', () => {
  let repository: ReturnType<typeof createRepository>;
  let service: InstanceType<typeof TenantServiceTrialService>;

  beforeEach(() => {
    repository = createRepository();
    service = new TenantServiceTrialService({
      repository,
      nowFactory: () => new Date(NOW),
    });
  });

  test('requires read permission before querying tenant trial history', async () => {
    await expect(service.listTrials(tenantAuth([]), {})).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    expect(repository.listTenantTrials).not.toHaveBeenCalled();
  });

  test('keeps reads tenant-scoped and returns only masked, effective facts', async () => {
    repository.listTenantTrials.mockImplementationOnce(async () => ({
      list: [makeActiveTrial()],
      pagination: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
    }));
    const result = await service.listTrials(
      tenantAuth(['billing.service_trial.read']),
      { page: 2, pageSize: 10 },
    );

    expect(repository.listTenantTrials).toHaveBeenCalledWith({
      tenantId: TENANT_ID, page: 2, pageSize: 10,
    });
    expect(result.server_time).toBe(NOW.toISOString());
    expect(result.list[0]).toMatchObject({
      id: TRIAL_ID,
      status: 'grace_period',
      persisted_status: 'active',
      contact_name: '张**',
      contact_phone: '138****8000',
    });
    expect(JSON.stringify(result)).not.toContain('13800138000');
    expect(result.list[0]!.available_actions.withdraw).toEqual({
      enabled: false,
      disabled_reason: '无试用申请权限',
    });
  });

  test('binds current and detail reads to the authenticated tenant', async () => {
    const auth = tenantAuth(['billing.service_trial.read']);
    await service.getCurrentTrial(auth);
    await service.getTrial(auth, TRIAL_ID);

    expect(repository.findCurrentTenantTrial).toHaveBeenCalledWith(TENANT_ID);
    expect(repository.findTrialById).toHaveBeenCalledWith({
      id: TRIAL_ID,
      tenantId: TENANT_ID,
    });

    repository.findTrialById.mockImplementationOnce(async () => null);
    await expect(service.getTrial(auth, TRIAL_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'SERVICE_TRIAL_NOT_FOUND',
    });
  });

  test('uses only authenticated tenant and employee facts when applying', async () => {
    const input = {
      application_reason: '体验项目协作', expected_user_count: 10,
      expected_project_count: 3, contact_name: '张经理',
      contact_phone: '13800138000', idempotency_key: IDEMPOTENCY_KEY,
    };
    const result = await service.apply(
      tenantAuth(['billing.service_trial.apply']),
      input,
    );

    expect(repository.executeCommand).toHaveBeenCalledWith({
      action: 'apply', tenantId: TENANT_ID, actorEmployeeId: ACTOR_ID,
      applicationReason: '体验项目协作', expectedUserCount: 10,
      expectedProjectCount: 3, contactName: '张经理',
      contactPhone: '13800138000', idempotencyKey: IDEMPOTENCY_KEY,
    });
    expect(repository.findTrialById).not.toHaveBeenCalled();
    expect(result.idempotent).toBe(false);
    expect(result.trial.contact_phone).toBe('138****8000');
    expect(result.available_actions.withdraw.enabled).toBe(true);
    expect(JSON.stringify(result)).not.toContain('13800138000');
  });

  test('requires apply permission and employee identity before writes', async () => {
    const input = {
      application_reason: '体验项目协作', expected_user_count: 10,
      expected_project_count: 3, contact_name: '张经理',
      contact_phone: '13800138000', idempotency_key: IDEMPOTENCY_KEY,
    };
    await expect(service.apply(tenantAuth([]), input)).rejects.toMatchObject({
      statusCode: 403, code: 'FORBIDDEN',
    });
    await expect(service.apply({
      ...tenantAuth(['billing.service_trial.apply']), employeeId: null,
    }, input)).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(repository.executeCommand).not.toHaveBeenCalled();
  });

  test('forwards expected version and reason when withdrawing', async () => {
    repository.findTrialById.mockImplementationOnce(async () => makeTrialDetail(
      makePendingTrial({
        status: 'withdrawn', withdrawn_at: NOW.toISOString(),
        withdrawn_by_employee_id: ACTOR_ID, withdraw_reason: '信息需要修改',
        version: 2,
      }),
    ));
    await service.withdraw(
      tenantAuth(['billing.service_trial.apply']),
      TRIAL_ID,
      { expected_version: 1, reason: '信息需要修改',
        idempotency_key: IDEMPOTENCY_KEY },
    );

    expect(repository.executeCommand).toHaveBeenCalledWith({
      action: 'withdraw', trialId: TRIAL_ID, tenantId: TENANT_ID,
      actorEmployeeId: ACTOR_ID, expectedVersion: 1,
      reason: '信息需要修改', idempotencyKey: IDEMPOTENCY_KEY,
    });
  });

  test('preserves stable repository business errors without another query', async () => {
    repository.executeCommand.mockImplementationOnce(async () => {
      throw Errors.business(409, '需要先完成企业身份认证',
        'SERVICE_TRIAL_ENTERPRISE_IDENTITY_REQUIRED');
    });
    await expect(service.apply(
      tenantAuth(['billing.service_trial.apply']),
      {
        application_reason: '体验项目协作', expected_user_count: 10,
        expected_project_count: 3, contact_name: '张经理',
        contact_phone: '13800138000', idempotency_key: IDEMPOTENCY_KEY,
      },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: 'SERVICE_TRIAL_ENTERPRISE_IDENTITY_REQUIRED',
    });
    expect(repository.findTrialById).not.toHaveBeenCalled();
  });

  test('preserves an existing-formal-service business error', async () => {
    repository.executeCommand.mockImplementationOnce(async () => {
      throw Errors.business(409, '正式服务有效时不能申请试用',
        'SERVICE_TRIAL_FORMAL_SERVICE_ACTIVE');
    });
    await expect(service.apply(
      tenantAuth(['billing.service_trial.apply']),
      {
        application_reason: '体验项目协作', expected_user_count: 10,
        expected_project_count: 3, contact_name: '张经理',
        contact_phone: '13800138000', idempotency_key: IDEMPOTENCY_KEY,
      },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: 'SERVICE_TRIAL_FORMAL_SERVICE_ACTIVE',
    });
  });

  test('returns the saved non-sensitive envelope when an old command is replayed', async () => {
    repository.executeCommand.mockImplementationOnce(async () => ({
      trial_id: TRIAL_ID, tenant_id: TENANT_ID, status: 'pending_review',
      version: 1, trial_snapshot: makeCommandSnapshot(), idempotent: true,
    }));
    repository.findTrialById.mockImplementationOnce(async () => makeTrialDetail(
      makePendingTrial({
        status: 'withdrawn', withdrawn_at: NOW.toISOString(),
        withdrawn_by_employee_id: ACTOR_ID, withdraw_reason: '后来撤回',
        version: 2,
      }),
    ));

    const result = await service.apply(
      tenantAuth(['billing.service_trial.apply']),
      {
        application_reason: '体验项目协作', expected_user_count: 10,
        expected_project_count: 3, contact_name: '张经理',
        contact_phone: '13800138000', idempotency_key: IDEMPOTENCY_KEY,
      },
    );

    expect(result.trial).toMatchObject({
      id: TRIAL_ID,
      tenant_id: TENANT_ID,
      status: 'pending_review',
      persisted_status: 'pending_review',
      application_reason: null,
      contact_name: '张**',
      contact_phone: '138****8000',
      version: 1,
    });
    expect(result.trial).not.toHaveProperty('tenant');
    expect(result.trial).not.toHaveProperty('events');
    expect(JSON.stringify(result)).not.toMatch(/13800138000|张经理/);
    expect(result.available_actions.withdraw).toEqual({
      enabled: true,
      disabled_reason: null,
    });
  });
});
