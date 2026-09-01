import { beforeAll, describe, expect, mock, test } from 'bun:test';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

let Controller: typeof import('.').TenantDouyinMaterialNotesController;

beforeAll(async () => {
  ({ TenantDouyinMaterialNotesController: Controller } = await import('.'));
});

const NOTE_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';
const IDEMPOTENCY_KEY = '33333333-3333-4333-8333-333333333333';
const authContext = {
  tenantId: '44444444-4444-4444-8444-444444444444',
  employeeId: '55555555-5555-4555-8555-555555555555',
  permissions: [],
};
const draft = {
  title: '装修开工清单',
  summary: '开工前检查事项',
  category: '施工避坑',
  applicable_to: null,
  content_blocks: [{ type: 'paragraph' as const, text: '确认施工图纸。' }],
};

function createController() {
  const emptyPage = { list: [], pagination: {
    page: 1, pageSize: 20, total: 0, totalPages: 0,
  } };
  const service = {
    list: mock(async () => emptyPage),
    create: mock(async () => ({ note_id: NOTE_ID })),
    getDetail: mock(async () => ({ id: NOTE_ID })),
    listVersions: mock(async () => emptyPage),
    getVersionDetail: mock(async () => ({ id: VERSION_ID })),
    appendVersion: mock(async () => ({ version_id: VERSION_ID })),
    publish: mock(async () => ({ note_id: NOTE_ID, status: 'published' })),
    archive: mock(async () => ({ note_id: NOTE_ID, status: 'archived' })),
    withdraw: mock(async () => ({ note_id: NOTE_ID, status: 'withdrawn' })),
  };
  const controller = new Controller(service as never);
  const getRequiredTenantContext = mock(async () => authContext);
  (controller as unknown as Record<string, unknown>).getRequiredTenantContext =
    getRequiredTenantContext;
  return { controller, service, getRequiredTenantContext };
}

describe('TenantDouyinMaterialNotesController', () => {
  test('registers exactly nine routes in the root registry', async () => {
    const { controller } = createController();
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: 'GET', path }),
      post: (path: string) => routes.push({ method: 'POST', path }),
    };
    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: 'GET', path: '/tenant/douyin-material-notes' },
      { method: 'POST', path: '/tenant/douyin-material-notes' },
      { method: 'GET', path: '/tenant/douyin-material-notes/:id' },
      { method: 'GET', path: '/tenant/douyin-material-notes/:id/versions' },
      { method: 'GET', path: '/tenant/douyin-material-notes/:id/versions/:versionId' },
      { method: 'POST', path: '/tenant/douyin-material-notes/:id/versions' },
      { method: 'POST', path: '/tenant/douyin-material-notes/:id/publish' },
      { method: 'POST', path: '/tenant/douyin-material-notes/:id/archive' },
      { method: 'POST', path: '/tenant/douyin-material-notes/:id/withdraw' },
    ]);

    const source = await Bun.file(new URL('../../routes/index.ts', import.meta.url)).text();
    expect(source).toContain(
      'import TenantDouyinMaterialNotesController from "@/controllers/tenant-douyin-material-notes";',
    );
    expect(source).toContain('TenantDouyinMaterialNotesController.registerExtraRoutes(app);');
  });

  test('validates list defaults before auth and wraps successful responses', async () => {
    const invalid = createController();
    await expect(invalid.controller.listNotes({ query: { pageSize: 101 } } as never))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(invalid.getRequiredTenantContext).not.toHaveBeenCalled();

    const valid = createController();
    await expect(valid.controller.listNotes({ query: {} } as never)).resolves.toEqual({
      data: { list: [], pagination: {
        page: 1, pageSize: 20, total: 0, totalPages: 0,
      } },
      message: 'success',
    });
    expect(valid.service.list).toHaveBeenCalledWith(authContext, {
      page: 1,
      pageSize: 20,
    });
  });

  test('validates strict params and draft bodies before auth', async () => {
    const context = createController();
    await expect(context.controller.getDetail({ params: { id: 'bad' } } as never))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(context.controller.getVersionDetail({
      params: { id: NOTE_ID, versionId: 'bad' },
    } as never)).rejects.toMatchObject({ statusCode: 400 });
    await expect(context.controller.createNote({
      body: { ...draft, tenant_id: authContext.tenantId },
    } as never)).rejects.toMatchObject({ statusCode: 400 });
    await expect(context.controller.appendVersion({
      params: { id: NOTE_ID },
      body: { ...draft, employee_id: authContext.employeeId },
    } as never)).rejects.toMatchObject({ statusCode: 400 });
    expect(context.getRequiredTenantContext).not.toHaveBeenCalled();
  });

  test('delegates create, detail, version history and append with normalized input', async () => {
    const context = createController();

    await expect(context.controller.createNote({ body: draft } as never))
      .resolves.toMatchObject({ data: { note_id: NOTE_ID }, message: 'success' });
    await context.controller.getDetail({ params: { id: NOTE_ID } } as never);
    await context.controller.listVersions({
      params: { id: NOTE_ID },
      query: {},
    } as never);
    await context.controller.appendVersion({
      params: { id: NOTE_ID },
      body: draft,
    } as never);

    expect(context.service.create).toHaveBeenCalledWith(authContext, draft);
    expect(context.service.getDetail).toHaveBeenCalledWith(authContext, NOTE_ID);
    expect(context.service.listVersions).toHaveBeenCalledWith(
      authContext,
      NOTE_ID,
      { page: 1, pageSize: 20 },
    );
    expect(context.service.appendVersion).toHaveBeenCalledWith(
      authContext,
      NOTE_ID,
      draft,
    );
  });

  test('requires a UUID Idempotency-Key and validates command bodies before auth', async () => {
    for (const request of [
      {
        params: { id: NOTE_ID },
        headers: {},
        body: { version_id: VERSION_ID, expected_status: 'draft' },
      },
      {
        params: { id: NOTE_ID },
        headers: { 'idempotency-key': 'not-a-uuid' },
        body: { version_id: VERSION_ID, expected_status: 'draft' },
      },
      {
        params: { id: NOTE_ID },
        headers: { 'idempotency-key': IDEMPOTENCY_KEY },
        body: { expected_status: 'published', reason: '' },
      },
    ]) {
      const context = createController();
      const method = 'version_id' in request.body ? 'publish' : 'archive';
      await expect(context.controller[method](request as never))
        .rejects.toMatchObject({ statusCode: 400 });
      expect(context.getRequiredTenantContext).not.toHaveBeenCalled();
    }
  });

  test('delegates version detail and all commands with parsed headers and wraps success', async () => {
    const context = createController();
    const headers = {
      'idempotency-key': IDEMPOTENCY_KEY,
      authorization: 'Bearer test',
    };

    await expect(context.controller.getVersionDetail({
      params: { id: NOTE_ID, versionId: VERSION_ID },
    } as never)).resolves.toMatchObject({
      data: { id: VERSION_ID },
      message: 'success',
    });
    await context.controller.publish({
      params: { id: NOTE_ID },
      headers,
      body: { version_id: VERSION_ID, expected_status: 'draft' },
    } as never);
    await context.controller.archive({
      params: { id: NOTE_ID },
      headers,
      body: { expected_status: 'published', reason: '  内容已过期  ' },
    } as never);
    await context.controller.withdraw({
      params: { id: NOTE_ID },
      headers,
      body: { expected_status: 'archived', reason: '  合规撤回  ' },
    } as never);

    expect(context.service.getVersionDetail).toHaveBeenCalledWith(
      authContext,
      NOTE_ID,
      VERSION_ID,
    );
    expect(context.service.publish).toHaveBeenCalledWith(
      authContext,
      NOTE_ID,
      { version_id: VERSION_ID, expected_status: 'draft' },
      IDEMPOTENCY_KEY,
    );
    expect(context.service.archive).toHaveBeenCalledWith(
      authContext,
      NOTE_ID,
      { expected_status: 'published', reason: '内容已过期' },
      IDEMPOTENCY_KEY,
    );
    expect(context.service.withdraw).toHaveBeenCalledWith(
      authContext,
      NOTE_ID,
      { expected_status: 'archived', reason: '合规撤回' },
      IDEMPOTENCY_KEY,
    );
  });
});
