import { beforeAll, describe, expect, mock, test } from 'bun:test';

import { Errors } from '@/errors/error-factory';
import type { AuthContext } from '@/services/authorization';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

let Service: typeof import('./tenant-douyin-material-notes').TenantDouyinMaterialNotesService;
beforeAll(async () => {
  ({ TenantDouyinMaterialNotesService: Service } = await import(
    './tenant-douyin-material-notes'
  ));
});

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const NOTE_ID = '22222222-2222-4222-8222-222222222222';
const VERSION_ID = '33333333-3333-4333-8333-333333333333';
const EMPLOYEE_ID = '44444444-4444-4444-8444-444444444444';
const IDEMPOTENCY_KEY = '55555555-5555-4555-8555-555555555555';
const NOW = '2026-09-01T08:00:00.000Z';

function auth(permissionCodes: string[]) {
  return {
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    permissions: permissionCodes.map((code) => ({ code, scope: 'all' })),
  } as AuthContext;
}

function fixture(overrides: Partial<Record<string, unknown>> = {}) {
  const repository = {
    transition: mock(async (input: { command: string }) => ({
      note_id: NOTE_ID,
      status: input.command === 'publish' ? 'published' as const
        : input.command === 'archive' ? 'archived' as const : 'withdrawn' as const,
      published_version_id: VERSION_ID,
      published_at: NOW,
    })),
    ...overrides,
  };
  const accessPolicy = {
    assertTenantContext: mock(() => TENANT_ID),
    assertPermission: mock((context: AuthContext, permission: string) => {
      if (!context.permissions.some((item) => item.code === permission)) {
        throw Object.assign(new Error('forbidden'), { statusCode: 403 });
      }
      return 'all';
    }),
  };
  return {
    service: new Service({ repository, accessPolicy } as never),
    repository,
  };
}

describe('TenantDouyinMaterialNotesService state commands', () => {
  test.each([
    ['publish', 'draft'],
    ['publish', 'published'],
    ['publish', 'archived'],
    ['archive', 'draft'],
    ['archive', 'published'],
    ['withdraw', 'published'],
    ['withdraw', 'archived'],
  ] as const)('allows %s from %s and binds canonical command fields', async (
    command,
    expectedStatus,
  ) => {
    const context = fixture();
    const body = command === 'publish'
      ? { version_id: VERSION_ID, expected_status: expectedStatus }
      : { expected_status: expectedStatus, reason: '状态变更原因' };

    await context.service[command](
      auth(['douyin_material_note.publish']),
      NOTE_ID,
      body as never,
      IDEMPOTENCY_KEY,
    );

    expect(context.repository.transition).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      noteId: NOTE_ID,
      actorEmployeeId: EMPLOYEE_ID,
      command,
      targetVersionId: command === 'publish' ? VERSION_ID : null,
      expectedStatus,
      reason: command === 'publish' ? null : '状态变更原因',
      idempotencyKey: IDEMPOTENCY_KEY,
    });
  });

  test.each([
    ['withdraw', 'draft'],
    ['archive', 'archived'],
    ['publish', 'withdrawn'],
    ['archive', 'withdrawn'],
    ['withdraw', 'withdrawn'],
  ] as const)('passes impossible %s from %s to the atomic RPC', async (
    command,
    expectedStatus,
  ) => {
    const stateConflict = Errors.business(
      409,
      '资料状态已变化',
      'MATERIAL_NOTE_STATE_CONFLICT',
    );
    const context = fixture({
      transition: mock(async () => { throw stateConflict; }),
    });
    const body = command === 'publish'
      ? { version_id: VERSION_ID, expected_status: expectedStatus }
      : { expected_status: expectedStatus, reason: '状态变更原因' };

    await expect(context.service[command](
      auth(['douyin_material_note.publish']),
      NOTE_ID,
      body as never,
      IDEMPOTENCY_KEY,
    )).rejects.toBe(stateConflict);
    expect(context.repository.transition).toHaveBeenCalledTimes(1);
  });

  test('lets the atomic RPC prioritize idempotency conflict over an invalid transition', async () => {
    const idempotencyConflict = Errors.business(
      409,
      '幂等键已用于不同请求',
      'MATERIAL_NOTE_IDEMPOTENCY_CONFLICT',
    );
    const context = fixture({
      transition: mock(async () => { throw idempotencyConflict; }),
    });
    await expect(context.service.withdraw(
      auth(['douyin_material_note.publish']),
      NOTE_ID,
      { expected_status: 'draft', reason: '与原请求不同' },
      IDEMPOTENCY_KEY,
    )).rejects.toBe(idempotencyConflict);
    expect(context.repository.transition).toHaveBeenCalledTimes(1);
  });

  test('preserves version, stale-state and idempotency conflicts from the atomic RPC', async () => {
    for (const code of [
      'MATERIAL_NOTE_VERSION_CONFLICT',
      'MATERIAL_NOTE_STATE_CONFLICT',
      'MATERIAL_NOTE_IDEMPOTENCY_CONFLICT',
    ]) {
      const context = fixture({
        transition: mock(async () => {
          throw Object.assign(new Error(code), { statusCode: 409, code });
        }),
      });
      await expect(context.service.publish(
        auth(['douyin_material_note.publish']),
        NOTE_ID,
        { version_id: VERSION_ID, expected_status: 'published' },
        IDEMPOTENCY_KEY,
      )).rejects.toMatchObject({ statusCode: 409, code });
    }
  });
});
