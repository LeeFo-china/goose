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
const AUTH_TENANT_ID = '99999999-9999-4999-8999-999999999999';
const NOTE_ID = '22222222-2222-4222-8222-222222222222';
const VERSION_ID = '33333333-3333-4333-8333-333333333333';
const EMPLOYEE_ID = '44444444-4444-4444-8444-444444444444';
const IDEMPOTENCY_KEY = '55555555-5555-4555-8555-555555555555';
const NOW = '2026-09-01T08:00:00.000Z';
const blocks = [{ type: 'paragraph' as const, text: '确认施工图纸。' }];
const draft = {
  title: '装修开工清单',
  summary: '开工前检查事项',
  category: '施工避坑',
  applicable_to: null,
  content_blocks: blocks,
};
const version = {
  id: VERSION_ID,
  note_id: NOTE_ID,
  version_no: 2,
  ...draft,
  created_by: EMPLOYEE_ID,
  created_at: NOW,
};
const { content_blocks: _contentBlocks, ...versionSummary } = version;
const detailRow = {
  id: NOTE_ID,
  status: 'published' as const,
  published_version_id: VERSION_ID,
  published_at: NOW,
  created_at: NOW,
  updated_at: NOW,
  latest_versions: [versionSummary],
  claims: [{ count: 7 }],
};
const listRow = {
  id: NOTE_ID,
  status: 'published' as const,
  published_at: NOW,
  updated_at: NOW,
  latest_versions: [{
    version_no: 2,
    title: draft.title,
    category: draft.category,
  }],
  claims: [{ count: 7 }],
};
function auth(
  permissionCodes: string[],
  employeeId: string | null = EMPLOYEE_ID,
  tenantId = TENANT_ID,
) {
  return {
    tenantId,
    employeeId,
    permissions: permissionCodes.map((code) => ({ code, scope: 'all' })),
  } as AuthContext;
}

function fixture(overrides: Partial<Record<string, unknown>> = {}) {
  const repository = {
    listTenant: mock(async () => ({ rows: [listRow], total: 1 })),
    findTenantDetail: mock(async () => detailRow),
    listVersions: mock(async () => ({ rows: [versionSummary], total: 1 })),
    findTenantVersionDetail: mock(async () => version),
    create: mock(async () => ({
      note_id: NOTE_ID,
      version_id: VERSION_ID,
      version_no: 1,
      status: 'draft' as const,
    })),
    appendVersion: mock(async () => ({
      note_id: NOTE_ID,
      version_id: VERSION_ID,
      version_no: 2,
      status: 'published' as const,
    })),
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
    accessPolicy,
  };
}

describe('TenantDouyinMaterialNotesService access and mapping', () => {
  test('gates all read endpoints with the read permission', async () => {
    const context = fixture();
    const user = auth(['douyin_material_note.read']);
    await context.service.list(user, { page: 1, pageSize: 20 });
    await context.service.getDetail(user, NOTE_ID);
    await context.service.listVersions(user, NOTE_ID, { page: 1, pageSize: 20 });
    await context.service.getVersionDetail(user, NOTE_ID, VERSION_ID);

    expect(context.accessPolicy.assertTenantContext).toHaveBeenCalledTimes(4);
    expect(context.accessPolicy.assertPermission).toHaveBeenCalledTimes(4);
    expect(context.accessPolicy.assertPermission).toHaveBeenCalledWith(
      user,
      'douyin_material_note.read',
    );

    for (const operation of [
      () => context.service.list(auth([]), { page: 1, pageSize: 20 }),
      () => context.service.getDetail(auth([]), NOTE_ID),
      () => context.service.listVersions(auth([]), NOTE_ID, { page: 1, pageSize: 20 }),
      () => context.service.getVersionDetail(auth([]), NOTE_ID, VERSION_ID),
    ]) {
      await expect(operation()).rejects.toMatchObject({ statusCode: 403 });
    }
  });

  test('gates draft writes with manage and state commands with publish', async () => {
    const context = fixture();
    const manager = auth(['douyin_material_note.manage']);
    const publisher = auth(['douyin_material_note.publish']);

    await context.service.create(manager, draft);
    await context.service.appendVersion(manager, NOTE_ID, draft);
    await context.service.publish(publisher, NOTE_ID, {
      version_id: VERSION_ID,
      expected_status: 'draft',
    }, IDEMPOTENCY_KEY);
    await context.service.archive(publisher, NOTE_ID, {
      expected_status: 'published',
      reason: '内容已过期',
    }, IDEMPOTENCY_KEY);
    await context.service.withdraw(publisher, NOTE_ID, {
      expected_status: 'archived',
      reason: '合规撤回',
    }, IDEMPOTENCY_KEY);

    expect(context.accessPolicy.assertPermission).toHaveBeenCalledWith(
      manager,
      'douyin_material_note.manage',
    );
    expect(context.accessPolicy.assertPermission).toHaveBeenCalledWith(
      publisher,
      'douyin_material_note.publish',
    );
    expect(context.repository.create).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorEmployeeId: EMPLOYEE_ID,
      draft,
    });
    expect(context.repository.transition).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT_ID,
      actorEmployeeId: EMPLOYEE_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
    }));

    await expect(context.service.create(auth([]), draft))
      .rejects.toMatchObject({ statusCode: 403 });
    await expect(context.service.publish(auth([]), NOTE_ID, {
      version_id: VERSION_ID,
      expected_status: 'draft',
    }, IDEMPOTENCY_KEY)).rejects.toMatchObject({ statusCode: 403 });
  });

  test('uses only authenticated tenant and employee identities for writes', async () => {
    const context = fixture();
    const user = auth(['douyin_material_note.manage'], EMPLOYEE_ID, AUTH_TENANT_ID);
    await context.service.appendVersion(user, NOTE_ID, draft);

    expect(context.repository.appendVersion).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      noteId: NOTE_ID,
      actorEmployeeId: EMPLOYEE_ID,
      draft,
    });
  });

  test('denies every write without its permission before repository access', async () => {
    const cases = [
      ['create', (context: ReturnType<typeof fixture>) =>
        context.service.create(auth([]), draft)],
      ['appendVersion', (context: ReturnType<typeof fixture>) =>
        context.service.appendVersion(auth([]), NOTE_ID, draft)],
      ['transition', (context: ReturnType<typeof fixture>) =>
        context.service.publish(auth([]), NOTE_ID, {
          version_id: VERSION_ID,
          expected_status: 'draft',
        }, IDEMPOTENCY_KEY)],
      ['transition', (context: ReturnType<typeof fixture>) =>
        context.service.archive(auth([]), NOTE_ID, {
          expected_status: 'published', reason: '归档原因',
        }, IDEMPOTENCY_KEY)],
      ['transition', (context: ReturnType<typeof fixture>) =>
        context.service.withdraw(auth([]), NOTE_ID, {
          expected_status: 'published', reason: '撤回原因',
        }, IDEMPOTENCY_KEY)],
    ] as const;

    for (const [repositoryMethod, operation] of cases) {
      const context = fixture();
      await expect(operation(context)).rejects.toMatchObject({ statusCode: 403 });
      expect(context.repository[repositoryMethod]).not.toHaveBeenCalled();
    }
  });

  test('denies every write when the authenticated employee is missing', async () => {
    const manager = auth(['douyin_material_note.manage'], null);
    const publisher = auth(['douyin_material_note.publish'], null);
    const cases = [
      ['create', (context: ReturnType<typeof fixture>) =>
        context.service.create(manager, draft)],
      ['appendVersion', (context: ReturnType<typeof fixture>) =>
        context.service.appendVersion(manager, NOTE_ID, draft)],
      ['transition', (context: ReturnType<typeof fixture>) =>
        context.service.publish(publisher, NOTE_ID, {
          version_id: VERSION_ID, expected_status: 'draft',
        }, IDEMPOTENCY_KEY)],
      ['transition', (context: ReturnType<typeof fixture>) =>
        context.service.archive(publisher, NOTE_ID, {
          expected_status: 'published', reason: '归档原因',
        }, IDEMPOTENCY_KEY)],
      ['transition', (context: ReturnType<typeof fixture>) =>
        context.service.withdraw(publisher, NOTE_ID, {
          expected_status: 'published', reason: '撤回原因',
        }, IDEMPOTENCY_KEY)],
    ] as const;

    for (const [repositoryMethod, operation] of cases) {
      const context = fixture();
      await expect(operation(context)).rejects.toMatchObject({
        statusCode: 403,
        code: 'MATERIAL_NOTE_EMPLOYEE_REQUIRED',
      });
      expect(context.repository[repositoryMethod]).not.toHaveBeenCalled();
    }
  });

  test('maps aggregate-only list, detail and body-free version history DTOs', async () => {
    const context = fixture();
    const user = auth(['douyin_material_note.read']);
    const list = await context.service.list(user, { page: 1, pageSize: 20 });
    const detail = await context.service.getDetail(user, NOTE_ID);
    const history = await context.service.listVersions(
      user,
      NOTE_ID,
      { page: 1, pageSize: 20 },
    );
    const versionDetail = await context.service.getVersionDetail(user, NOTE_ID, VERSION_ID);

    expect(list).toEqual({
      list: [{
        id: NOTE_ID,
        status: 'published',
        title: draft.title,
        category: draft.category,
        current_version: 2,
        claim_count: 7,
        published_at: NOW,
        updated_at: NOW,
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    expect(JSON.stringify(list)).not.toMatch(/claims|subject_hash|content_blocks/);
    expect(detail).toMatchObject({
      id: NOTE_ID,
      claim_count: 7,
      latest_version: { version: 2 },
    });
    expect(JSON.stringify(detail)).not.toContain('content_blocks');
    const { version_no: _historyVersionNo, ...historyFields } = versionSummary;
    expect(history.list[0]).toEqual({ ...historyFields, version: 2 });
    expect(JSON.stringify(history)).not.toContain('content_blocks');
    const { version_no: _detailVersionNo, ...versionFields } = version;
    expect(versionDetail).toEqual({ ...versionFields, version: 2 });
  });

  test('returns the same 404 for missing, cross-tenant and mismatched versions', async () => {
    const user = auth(['douyin_material_note.read']);
    for (const operation of [
      (service: InstanceType<typeof Service>) => service.getDetail(user, NOTE_ID),
      (service: InstanceType<typeof Service>) => service.listVersions(
        user,
        NOTE_ID,
        { page: 1, pageSize: 20 },
      ),
      (service: InstanceType<typeof Service>) => service.getVersionDetail(
        user,
        NOTE_ID,
        VERSION_ID,
      ),
    ]) {
      const context = fixture({
        findTenantDetail: mock(async () => null),
        listVersions: mock(async () => ({ rows: [], total: 0 })),
        findTenantVersionDetail: mock(async () => null),
      });
      await expect(operation(context.service)).rejects.toMatchObject({
        statusCode: 404,
        code: 'MATERIAL_NOTE_NOT_FOUND',
      });
    }
  });

  test('returns a total-zero empty tenant page after the last page', async () => {
    const context = fixture({
      listTenant: mock(async () => ({ rows: [], total: 0 })),
    });
    const user = auth(['douyin_material_note.read']);
    await expect(context.service.list(user, { page: 2, pageSize: 20 }))
      .resolves.toEqual({
        list: [],
        pagination: { page: 2, pageSize: 20, total: 0, totalPages: 0 },
      });
  });

  test('rejects total-zero version pages and inconsistent rows', async () => {
    const cases = [
      [[], { statusCode: 404, code: 'MATERIAL_NOTE_NOT_FOUND' }],
      [[versionSummary], { statusCode: 500, code: 'MATERIAL_NOTE_RESPONSE_INVALID' }],
    ] as const;
    for (const [rows, expected] of cases) {
      const context = fixture({ listVersions: mock(async () => ({ rows, total: 0 })) });
      await expect(context.service.listVersions(
        auth(['douyin_material_note.read']), NOTE_ID, { page: 2, pageSize: 20 },
      )).rejects.toMatchObject(expected);
    }
  });
  test('returns an empty version page past the end when the note exists', async () => {
    const context = fixture({
      listVersions: mock(async () => ({ rows: [], total: 1 })),
    });
    await expect(context.service.listVersions(
      auth(['douyin_material_note.read']),
      NOTE_ID,
      { page: 2, pageSize: 20 },
    )).resolves.toEqual({
      list: [],
      pagination: { page: 2, pageSize: 20, total: 1, totalPages: 1 },
    });
  });

  test('preserves scoped repository AppErrors for append and transition', async () => {
    const notFound = Errors.business(404, '资料不存在', 'MATERIAL_NOTE_NOT_FOUND');
    const versionConflict = Errors.business(
      409,
      '资料版本冲突',
      'MATERIAL_NOTE_VERSION_CONFLICT',
    );
    const append = fixture({
      appendVersion: mock(async () => { throw notFound; }),
    });
    await expect(append.service.appendVersion(
      auth(['douyin_material_note.manage']),
      NOTE_ID,
      draft,
    )).rejects.toBe(notFound);

    const transition = fixture({
      transition: mock(async () => { throw versionConflict; }),
    });
    await expect(transition.service.publish(
      auth(['douyin_material_note.publish']),
      NOTE_ID,
      { version_id: VERSION_ID, expected_status: 'draft' },
      IDEMPOTENCY_KEY,
    )).rejects.toBe(versionConflict);
  });
});

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
