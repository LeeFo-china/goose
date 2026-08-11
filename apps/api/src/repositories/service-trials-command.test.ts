import { beforeAll, describe, expect, test } from 'bun:test';
import type { PlatformServiceTrialScopeV1 } from '@gooes/domain';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

import type {
  ServiceTrialClient,
  TrialCommandInput,
  TrialCommandResult,
} from './service-trials';

let ServiceTrialRepository: typeof import('./service-trials').ServiceTrialRepository;
beforeAll(async () => {
  ({ ServiceTrialRepository } = await import('./service-trials'));
});

type DbResult = { data: unknown; error: unknown };
type Call = readonly [string, ...unknown[]];
const TRIAL_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '44444444-4444-4444-8444-444444444444';
const ASSIGNEE_ID = '55555555-5555-4555-8555-555555555555';
const IDEMPOTENCY_KEY = '66666666-6666-4666-8666-666666666666';
const NOW = '2026-08-11T08:00:00.000Z';

function harness(rpcResult: DbResult | (() => Promise<DbResult>)) {
  const calls: Call[] = [];
  const client = {
    from: () => null,
    rpc(name: string, params: Record<string, unknown>) {
      calls.push(['rpc', name, params]);
      return typeof rpcResult === 'function'
        ? rpcResult()
        : Promise.resolve(rpcResult);
    },
  };
  return {
    calls,
    repository: new ServiceTrialRepository(
      () => client as unknown as ServiceTrialClient,
    ),
  };
}

const commandResult = {
  trial_id: TRIAL_ID,
  tenant_id: TENANT_ID,
  status: 'active',
  version: 2,
  idempotent: false,
} as const;

const reviewTypeBase = {
  action: 'review', trialId: TRIAL_ID, actorEmployeeId: ACTOR_ID,
  expectedVersion: 1, idempotencyKey: IDEMPOTENCY_KEY, reason: '审核',
} as const;
const grantTypeBase = {
  action: 'grant', tenantId: TENANT_ID, actorEmployeeId: ACTOR_ID,
  reason: '发放', idempotencyKey: IDEMPOTENCY_KEY, allowOverride: false,
} as const;
const validScope: PlatformServiceTrialScopeV1 = {
  version: 1, capabilities: ['core.projects'],
};
const approvedReviewWithoutScope = { ...reviewTypeBase, decision: 'approved',
  trialType: 'standard', allowOverride: false } as const;
const rejectedReviewWithGrant = { ...reviewTypeBase, decision: 'rejected',
  trialType: 'standard', scope: { version: 1, capabilities: [] },
  allowOverride: false } as const;
const guidedReviewWithoutAssignee = { ...reviewTypeBase, decision: 'approved',
  trialType: 'guided', scope: validScope,
  allowOverride: false } as const;
const grantWithoutScope = { ...grantTypeBase,
  trialType: 'standard' } as const;
const guidedGrantWithoutAssignee = { ...grantTypeBase, trialType: 'guided',
  scope: validScope } as const;
// @ts-expect-error approved review requires a scope
const approvedReviewContract: TrialCommandInput = approvedReviewWithoutScope;
// @ts-expect-error rejected review forbids grant configuration
const rejectedReviewContract: TrialCommandInput = rejectedReviewWithGrant;
// @ts-expect-error guided review requires a non-null assignee
const guidedReviewContract: TrialCommandInput = guidedReviewWithoutAssignee;
// @ts-expect-error grant requires a scope
const grantScopeContract: TrialCommandInput = grantWithoutScope;
// @ts-expect-error guided grant requires a non-null assignee
const guidedGrantContract: TrialCommandInput = guidedGrantWithoutAssignee;

const commandCases: Array<{
  name: string;
  input: TrialCommandInput;
  rpc: string;
  params: Record<string, unknown>;
  data?: TrialCommandResult;
}> = [
  {
    name: 'apply',
    input: {
      action: 'apply', tenantId: TENANT_ID, actorEmployeeId: ACTOR_ID,
      applicationReason: '体验项目协作', expectedUserCount: 10,
      expectedProjectCount: 3, contactName: '张三',
      contactPhone: '13800138000', idempotencyKey: IDEMPOTENCY_KEY,
    },
    rpc: 'platform_service_trial_apply',
    params: {
      p_tenant_id: TENANT_ID, p_actor_employee_id: ACTOR_ID,
      p_application_reason: '体验项目协作', p_expected_user_count: 10,
      p_expected_project_count: 3, p_contact_name: '张三',
      p_contact_phone: '13800138000', p_idempotency_key: IDEMPOTENCY_KEY,
    },
  },
  {
    name: 'withdraw',
    input: {
      action: 'withdraw', trialId: TRIAL_ID, tenantId: TENANT_ID,
      actorEmployeeId: ACTOR_ID, expectedVersion: 1, reason: '暂不需要',
      idempotencyKey: IDEMPOTENCY_KEY,
    },
    rpc: 'platform_service_trial_withdraw',
    params: {
      p_trial_id: TRIAL_ID, p_tenant_id: TENANT_ID,
      p_actor_employee_id: ACTOR_ID, p_expected_version: 1,
      p_reason: '暂不需要', p_idempotency_key: IDEMPOTENCY_KEY,
    },
  },
  {
    name: 'review',
    input: {
      action: 'review', trialId: TRIAL_ID, actorEmployeeId: ACTOR_ID,
      decision: 'approved', expectedVersion: 1,
      idempotencyKey: IDEMPOTENCY_KEY, reason: '符合条件', trialType: 'guided',
      scope: { version: 1, capabilities: ['core.projects'] }, trialDays: 30,
      graceDays: 7, startsAt: NOW, assigneeEmployeeId: ASSIGNEE_ID,
      allowOverride: false,
    },
    rpc: 'platform_service_trial_review',
    params: {
      p_trial_id: TRIAL_ID, p_actor_employee_id: ACTOR_ID,
      p_decision: 'approved', p_expected_version: 1,
      p_idempotency_key: IDEMPOTENCY_KEY, p_reason: '符合条件',
      p_trial_type: 'guided',
      p_scope: { version: 1, capabilities: ['core.projects'] },
      p_trial_days: 30, p_grace_days: 7, p_starts_at: NOW,
      p_assignee_employee_id: ASSIGNEE_ID, p_allow_override: false,
    },
  },
  {
    name: 'grant',
    input: {
      action: 'grant', tenantId: TENANT_ID, actorEmployeeId: ACTOR_ID,
      trialType: 'standard', scope: { version: 1, capabilities: ['core.projects'] },
      reason: '重点租户', idempotencyKey: IDEMPOTENCY_KEY, trialDays: 30,
      graceDays: 7, startsAt: NOW, assigneeEmployeeId: null,
      allowOverride: true,
    },
    rpc: 'platform_service_trial_grant',
    params: {
      p_tenant_id: TENANT_ID, p_actor_employee_id: ACTOR_ID,
      p_trial_type: 'standard',
      p_scope: { version: 1, capabilities: ['core.projects'] },
      p_reason: '重点租户', p_idempotency_key: IDEMPOTENCY_KEY,
      p_trial_days: 30, p_grace_days: 7, p_starts_at: NOW,
      p_assignee_employee_id: null, p_allow_override: true,
    },
  },
  {
    name: 'extend',
    input: {
      action: 'extend', trialId: TRIAL_ID, actorEmployeeId: ACTOR_ID,
      expectedVersion: 1, idempotencyKey: IDEMPOTENCY_KEY,
      extensionDays: 7, reason: '延期验证', allowOverride: false,
    },
    rpc: 'platform_service_trial_extend',
    params: {
      p_trial_id: TRIAL_ID, p_actor_employee_id: ACTOR_ID,
      p_expected_version: 1, p_idempotency_key: IDEMPOTENCY_KEY,
      p_extension_days: 7, p_reason: '延期验证', p_allow_override: false,
    },
  },
  {
    name: 'revoke',
    input: {
      action: 'revoke', trialId: TRIAL_ID, actorEmployeeId: ACTOR_ID,
      expectedVersion: 1, idempotencyKey: IDEMPOTENCY_KEY, reason: '违规使用',
    },
    rpc: 'platform_service_trial_revoke',
    params: {
      p_trial_id: TRIAL_ID, p_actor_employee_id: ACTOR_ID,
      p_expected_version: 1, p_idempotency_key: IDEMPOTENCY_KEY,
      p_reason: '违规使用',
    },
  },
  {
    name: 'assign',
    input: {
      action: 'assign', trialId: TRIAL_ID, actorEmployeeId: ACTOR_ID,
      expectedVersion: 1, idempotencyKey: IDEMPOTENCY_KEY,
      assigneeEmployeeId: ASSIGNEE_ID,
    },
    rpc: 'platform_service_trial_assign',
    params: {
      p_trial_id: TRIAL_ID, p_actor_employee_id: ACTOR_ID,
      p_expected_version: 1, p_idempotency_key: IDEMPOTENCY_KEY,
      p_assignee_employee_id: ASSIGNEE_ID,
    },
    data: { ...commandResult, assigned: true },
  },
];

describe('ServiceTrialRepository commands', () => {
  test.each(commandCases)(
    'maps $name to the exact RPC signature',
    async ({ input, rpc, params, data }) => {
      const expected = data ?? commandResult;
      const f = harness({ data: expected, error: null });
      expect(await f.repository.executeCommand(input)).toEqual(expected);
      expect(f.calls).toEqual([['rpc', rpc, params]]);
    },
  );

  test('strictly validates command envelopes and action-specific assigned fact', async () => {
    for (const data of [
      { ...commandResult, secret: 'unexpected' },
      { ...commandResult, version: 0 },
      [{ ...commandResult }, { ...commandResult }],
    ]) {
      const f = harness({ data, error: null });
      await expect(f.repository.executeCommand(commandCases[0]!.input)).rejects
        .toMatchObject({ statusCode: 500, code: 'DB_ERROR', details: undefined });
    }
    const assign = harness({ data: commandResult, error: null });
    await expect(assign.repository.executeCommand(commandCases[6]!.input)).rejects
      .toMatchObject({ statusCode: 500, code: 'DB_ERROR' });
  });

  test('binds assign result to whether an assignee was requested', async () => {
    const assignedInput = commandCases[6]!.input;
    const mismatchedAssigned = harness({ data: {
      ...commandResult, assigned: false,
    }, error: null });
    await expect(mismatchedAssigned.repository.executeCommand(assignedInput)).rejects
      .toMatchObject({ statusCode: 500, code: 'DB_ERROR', details: undefined });

    const clearedInput: TrialCommandInput = {
      action: 'assign', trialId: TRIAL_ID, actorEmployeeId: ACTOR_ID,
      expectedVersion: 1, idempotencyKey: IDEMPOTENCY_KEY,
      assigneeEmployeeId: null,
    };
    const mismatchedCleared = harness({ data: {
      ...commandResult, assigned: true,
    }, error: null });
    await expect(mismatchedCleared.repository.executeCommand(clearedInput)).rejects
      .toMatchObject({ statusCode: 500, code: 'DB_ERROR', details: undefined });
  });

  test.each([
    ['SERVICE_TRIAL_NOT_FOUND', 404],
    ['SERVICE_TRIAL_REPEAT_REQUIRES_OVERRIDE', 403],
    ['SERVICE_TRIAL_APPLICATION_PENDING', 409],
    ['SERVICE_TRIAL_ACTIVE_EXISTS', 409],
    ['SERVICE_TRIAL_FORMAL_SERVICE_ACTIVE', 409],
    ['SERVICE_TRIAL_REAPPLY_COOLDOWN', 409],
    ['SERVICE_TRIAL_ENTERPRISE_IDENTITY_REQUIRED', 409],
    ['SERVICE_TRIAL_ACTION_NOT_ALLOWED', 409],
    ['SERVICE_TRIAL_VERSION_CONFLICT', 409],
    ['SERVICE_TRIAL_IDEMPOTENCY_CONFLICT', 409],
    ['SERVICE_TRIAL_EXTENSION_INVALID', 400],
  ] as const)(
    'maps stable postgres error %s without leaking details',
    async (code, statusCode) => {
      const f = harness({ data: null, error: {
        code: 'P0001', message: code, details: 'sensitive context',
      } });
      const error = await f.repository.executeCommand(commandCases[0]!.input)
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject({ statusCode, code, details: undefined });
      expect(String(error)).not.toContain('sensitive context');
    },
  );

  test('wraps unknown returned and rejected RPC failures without raw details', async () => {
    for (const f of [
      harness({ data: null, error: { code: 'XX000', message: 'raw returned' } }),
      harness(() => Promise.reject({ message: 'raw rejected' })),
    ]) {
      const error = await f.repository.executeCommand(commandCases[0]!.input)
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject({
        statusCode: 500,
        code: 'DB_ERROR',
        message: '执行技术服务试用操作失败',
        details: undefined,
      });
      expect(String(error)).not.toMatch(/raw returned|raw rejected/);
    }
  });
});
