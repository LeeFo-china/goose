import { beforeAll, describe, expect, mock, test } from 'bun:test';
import type { DouyinMaterialNoteContentBlocks } from '@gooes/domain';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import type {
  DouyinMaterialNotesDatabaseClient,
  DouyinMaterialNotesDatabaseResult,
  DouyinMaterialNotesQuery,
} from './douyin-material-notes';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

let Repository: typeof import('./douyin-material-notes').DouyinMaterialNotesRepository;
beforeAll(async () => {
  ({ DouyinMaterialNotesRepository: Repository } = await import('./douyin-material-notes'));
});

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const INSTALLATION_ID = '22222222-2222-4222-8222-222222222222';
const NOTE_ID = '33333333-3333-4333-8333-333333333333';
const VERSION_ID = '44444444-4444-4444-8444-444444444444';
const CLAIM_ID = '55555555-5555-4555-8555-555555555555';
const EMPLOYEE_ID = '66666666-6666-4666-8666-666666666666';
const IDEMPOTENCY_KEY = '77777777-7777-4777-8777-777777777777';
const IMAGE_FILE_ID = '88888888-8888-4888-8888-888888888888';
const CATEGORY_ID = '99999999-9999-4999-8999-999999999999';
const NOW = '2026-09-01T08:00:00.000Z';
const SUBJECT_HASH = 'a'.repeat(64);
const blocks: DouyinMaterialNoteContentBlocks = [
  { type: 'paragraph', text: '确认施工图纸。' },
];
const version = {
  id: VERSION_ID,
  note_id: NOTE_ID,
  version_no: 1,
  title: '装修开工清单',
  summary: '开工前检查事项',
  category: '施工避坑',
  category_id: CATEGORY_ID,
  applicable_to: null,
  content_blocks: blocks,
  created_by: EMPLOYEE_ID,
  created_at: NOW,
};
const { content_blocks: _content, ...versionSummary } = version;
const previewVersion = {
  title: version.title,
  summary: version.summary,
  category: version.category,
  category_id: CATEGORY_ID,
  applicable_to: null,
};
const publicRow = {
  id: NOTE_ID,
  published_at: NOW,
  published_version: previewVersion,
  claims: [{ id: CLAIM_ID }],
};
const ownedRow = {
  id: CLAIM_ID,
  claimed_at: NOW,
  note: { id: NOTE_ID, status: 'archived' as const },
  claimed_version: { ...previewVersion, version_no: 1 },
};
const ownedDetailRow = {
  ...ownedRow,
  claimed_version: { ...ownedRow.claimed_version, content_blocks: blocks },
};

type Call = { readonly method: string; readonly args: readonly unknown[] };

function clientWith(results: DouyinMaterialNotesDatabaseResult[]) {
  const calls: Call[] = [];
  let index = 0;
  class Query implements DouyinMaterialNotesQuery {
    private call(method: string, args: readonly unknown[]) {
      calls.push({ method, args });
      return this;
    }
    select(...args: unknown[]) { return this.call('select', args); }
    eq(...args: unknown[]) { return this.call('eq', args); }
    is(...args: unknown[]) { return this.call('is', args); }
    in(...args: unknown[]) { return this.call('in', args); }
    or(...args: unknown[]) { return this.call('or', args); }
    order(...args: unknown[]) { return this.call('order', args); }
    range(...args: unknown[]) { return this.call('range', args); }
    limit(...args: unknown[]) { return this.call('limit', args); }
    insert(...args: unknown[]) { return this.call('insert', args); }
    update(...args: unknown[]) { return this.call('update', args); }
    single() {
      calls.push({ method: 'single', args: [] });
      return Promise.resolve(results[index++] ?? { data: null, error: null });
    }
    maybeSingle() {
      calls.push({ method: 'maybeSingle', args: [] });
      return Promise.resolve(results[index++] ?? { data: null, error: null });
    }
    then<TResult1 = DouyinMaterialNotesDatabaseResult, TResult2 = never>(
      onfulfilled?: ((value: DouyinMaterialNotesDatabaseResult) =>
        TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(results[index++] ?? { data: null, error: null })
        .then(onfulfilled, onrejected);
    }
  }
  const client: DouyinMaterialNotesDatabaseClient = {
    from: mock((table: string) => {
      calls.push({ method: 'from', args: [table] });
      return new Query();
    }),
    rpc: mock((name: string, args: Readonly<Record<string, unknown>>) => {
      calls.push({ method: 'rpc', args: [name, args] });
      return Promise.resolve(results[index++] ?? { data: null, error: null });
    }),
  };
  return { client, calls };
}

function selects(calls: readonly Call[]) {
  return calls.filter((call) => call.method === 'select')
    .map((call) => String(call.args[0]));
}

function expectScope(calls: readonly Call[], expected: readonly Call[]) {
  for (const call of expected) expect(calls).toContainEqual(call);
}

const publicInput = {
  tenantId: TENANT_ID,
  installationId: INSTALLATION_ID,
  subjectHash: SUBJECT_HASH,
};
const publicScope = [
  { method: 'eq', args: ['tenant_id', TENANT_ID] },
  { method: 'eq', args: ['status', 'published'] },
  { method: 'eq', args: ['claims.douyin_miniapp_installation_id', INSTALLATION_ID] },
  { method: 'eq', args: ['claims.subject_hash', SUBJECT_HASH] },
  { method: 'is', args: ['claims.removed_at', null] },
] as const;
const ownedScope = [
  { method: 'eq', args: ['tenant_id', TENANT_ID] },
  { method: 'eq', args: ['douyin_miniapp_installation_id', INSTALLATION_ID] },
  { method: 'eq', args: ['subject_hash', SUBJECT_HASH] },
  { method: 'is', args: ['removed_at', null] },
] as const;

describe('DouyinMaterialNotesRepository query boundaries', () => {
  test('material categories are tenant-scoped, paginated and body-free', async () => {
    const categoryRow = {
      id: CATEGORY_ID,
      name: '施工避坑',
      description: null,
      status: 'active' as const,
      sort_order: 10,
      created_at: NOW,
      updated_at: NOW,
    };
    const context = clientWith([
      { data: [categoryRow], error: null, count: 1 },
      { data: categoryRow, error: null },
      { data: { ...categoryRow, status: 'disabled' }, error: null },
    ]);
    const repository = new Repository(context.client);

    await repository.listCategories({
      tenantId: TENANT_ID,
      page: 2,
      pageSize: 20,
      keyword: '避坑',
      status: 'active',
    });
    await repository.createCategory({
      tenantId: TENANT_ID,
      actorEmployeeId: EMPLOYEE_ID,
      name: '施工避坑',
      description: null,
      sortOrder: 10,
    });
    await repository.updateCategory({
      tenantId: TENANT_ID,
      actorEmployeeId: EMPLOYEE_ID,
      categoryId: CATEGORY_ID,
      name: '施工避坑',
      description: '施工阶段资料',
      status: 'disabled',
      sortOrder: 20,
    });

    expect(context.calls).toContainEqual({
      method: 'from',
      args: ['douyin_material_note_categories'],
    });
    expect(context.calls).toContainEqual({ method: 'range', args: [20, 39] });
    expect(context.calls).toContainEqual({ method: 'eq', args: ['tenant_id', TENANT_ID] });
    expect(context.calls).toContainEqual({ method: 'is', args: ['deleted_at', null] });
    expect(context.calls).toContainEqual({ method: 'eq', args: ['status', 'active'] });
    expect(context.calls).toContainEqual({
      method: 'or',
      args: ['name.ilike."%避坑%",description.ilike."%避坑%"'],
    });
    expect(context.calls).toContainEqual({
      method: 'order',
      args: ['sort_order', { ascending: true }],
    });
    expect(context.calls).toContainEqual({
      method: 'insert',
      args: [{
        tenant_id: TENANT_ID,
        name: '施工避坑',
        description: null,
        status: 'active',
        sort_order: 10,
        created_by: EMPLOYEE_ID,
        updated_by: EMPLOYEE_ID,
      }],
    });
    expect(context.calls).toContainEqual({
      method: 'update',
      args: [{
        name: '施工避坑',
        description: '施工阶段资料',
        status: 'disabled',
        sort_order: 20,
        updated_by: EMPLOYEE_ID,
      }],
    });
    expect(selects(context.calls).join(',')).not.toContain('content_blocks');
  });

  test('public keyword list filters parents before stable pagination', async () => {
    const context = clientWith([{ data: [publicRow], error: null, count: 21 }]);
    await expect(new Repository(context.client).listPublic({
      ...publicInput, page: 2, pageSize: 20, keyword: '开工',
    })).resolves.toEqual({ rows: [publicRow], total: 21 });

    expectScope(context.calls, publicScope);
    expect(context.calls).toContainEqual({ method: 'range', args: [20, 39] });
    expect(context.calls).toContainEqual({
      method: 'order', args: ['published_at', { ascending: false }],
    });
    expect(context.calls).toContainEqual({
      method: 'order', args: ['id', { ascending: false }],
    });
    expect(selects(context.calls)[0]).toContain(
      'published_version:douyin_material_note_versions!douyin_material_notes_published_version_owner_fkey!inner',
    );
    expect(selects(context.calls).join(',')).not.toContain('content_blocks');
    expect(selects(context.calls).join(',')).not.toContain('subject_hash');
  });

  test('quotes reserved keyword characters in a real PostgREST builder URL', async () => {
    let capturedUrl: URL | undefined;
    const fetcher = async (input: string | URL | Request) => {
      capturedUrl = new URL(input instanceof Request ? input.url : input.toString());
      return new Response(JSON.stringify([publicRow]), {
        status: 200,
        headers: { 'content-type': 'application/json', 'content-range': '0-0/1' },
      });
    };
    const client = createSupabaseClient('http://material.test', 'test-key', {
      global: { fetch: fetcher as typeof fetch },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await new Repository(client as unknown as DouyinMaterialNotesDatabaseClient)
      .listPublic({
        ...publicInput,
        page: 1,
        pageSize: 20,
        keyword: 'a,b(c)"d\\e%f_g',
      });

    expect(capturedUrl?.searchParams.get('published_version.or')).toBe(
      '(title.ilike."%a,b(c)\\"d\\\\e\\%f\\_g%",summary.ilike."%a,b(c)\\"d\\\\e\\%f\\_g%",category.ilike."%a,b(c)\\"d\\\\e\\%f\\_g%")',
    );
    expect(capturedUrl?.searchParams.get('select')).toContain('!inner');
  });

  test('tenant and owned lists are bounded, stable and body-free', async () => {
    const tenantRow = {
      id: NOTE_ID,
      status: 'draft' as const,
      published_at: null,
      updated_at: NOW,
      latest_versions: [{ version_no: 1, title: version.title, category: version.category }],
      claims: [{ count: 3 }],
      search_versions: [{ id: VERSION_ID }],
    };
    const context = clientWith([
      { data: [tenantRow], error: null, count: 1 },
      { data: [ownedRow], error: null, count: 1 },
    ]);
    const repository = new Repository(context.client);
    await repository.listTenant({
      tenantId: TENANT_ID, page: 1, pageSize: 20, status: 'draft', keyword: '开工',
    });
    const tenantCallCount = context.calls.length;
    await repository.listOwned({ ...publicInput, page: 1, pageSize: 20 });
    const ownedCalls = context.calls.slice(tenantCallCount);

    expectScope(ownedCalls, ownedScope);
    expect(context.calls.filter((call) => call.method === 'range')
      .map((call) => call.args)).toEqual([[0, 19], [0, 19]]);
    expect(context.calls).toContainEqual({
      method: 'order', args: ['updated_at', { ascending: false }],
    });
    expect(context.calls).toContainEqual({
      method: 'order', args: ['claimed_at', { ascending: false }],
    });
    expect(selects(context.calls).join(',')).not.toContain('content_blocks');
    expect(selects(context.calls).join(',')).toContain('claims:douyin_material_note_claims');
  });

  test('public preview and owned detail keep full identity predicates', async () => {
    const context = clientWith([
      { data: publicRow, error: null },
      { data: ownedDetailRow, error: null },
    ]);
    const repository = new Repository(context.client);
    await repository.findPublicPreview({ ...publicInput, noteId: NOTE_ID });
    const publicCalls = context.calls.slice();
    await repository.findOwnedDetail({ ...publicInput, claimId: CLAIM_ID });

    expectScope(publicCalls, publicScope);
    expectScope(context.calls.slice(publicCalls.length), ownedScope);
    expect(publicCalls).toContainEqual({ method: 'eq', args: ['id', NOTE_ID] });
    expect(context.calls.slice(publicCalls.length)).toContainEqual({
      method: 'eq', args: ['id', CLAIM_ID],
    });
    expect(selects(publicCalls)[0]).not.toContain('!inner');
    const detailSelect = selects(context.calls)[1] ?? '';
    expect(detailSelect).toContain('content_blocks');
    expect(detailSelect).not.toMatch(/created_by|created_at/);
  });

  test('rejects malformed relations and null page data instead of fabricating rows', async () => {
    const results = [
      {
        data: [{ ...publicRow, published_version: { ...previewVersion, applicable_to: 8 } }],
        error: null,
        count: 1,
      },
      { data: [{ ...publicRow, published_version: null }], error: null, count: 1 },
      { data: null, error: null, count: 0 },
    ];
    for (const result of results) {
      const context = clientWith([result]);
      await expect(new Repository(context.client).listPublic({
        ...publicInput, page: 1, pageSize: 20,
      })).rejects.toMatchObject({ code: 'MATERIAL_NOTE_REPOSITORY_RESPONSE_INVALID' });
    }
  });

  test('version history is body-free and detail is triple scoped', async () => {
    const listContext = clientWith([{ data: [versionSummary], error: null, count: 1 }]);
    await expect(new Repository(listContext.client).listVersions({
      tenantId: TENANT_ID, noteId: NOTE_ID, page: 1, pageSize: 20,
    })).resolves.toEqual({ rows: [versionSummary], total: 1 });
    const detailContext = clientWith([{ data: version, error: null }]);
    await expect(new Repository(detailContext.client).findTenantVersionDetail({
      tenantId: TENANT_ID, noteId: NOTE_ID, versionId: VERSION_ID,
    })).resolves.toEqual(version);

    expect(selects(listContext.calls)[0]).not.toContain('content_blocks');
    expect(selects(detailContext.calls)[0]).toContain('content_blocks');
    expect(listContext.calls).toContainEqual({
      method: 'order', args: ['created_at', { ascending: false }],
    });
    expect(listContext.calls).toContainEqual({
      method: 'order', args: ['id', { ascending: false }],
    });
    expectScope(listContext.calls, [
      { method: 'eq', args: ['tenant_id', TENANT_ID] },
      { method: 'eq', args: ['note_id', NOTE_ID] },
    ]);
    expectScope(detailContext.calls, [
      { method: 'eq', args: ['tenant_id', TENANT_ID] },
      { method: 'eq', args: ['note_id', NOTE_ID] },
      { method: 'eq', args: ['id', VERSION_ID] },
    ]);
  });

  test('tenant note detail is body-free while version detail remains triple scoped', async () => {
    const tenantDetailRow = {
      id: NOTE_ID,
      status: 'published' as const,
      published_version_id: VERSION_ID,
      published_at: NOW,
      created_at: NOW,
      updated_at: NOW,
      latest_versions: [versionSummary],
      claims: [{ count: 3 }],
    };
    const context = clientWith([
      { data: tenantDetailRow, error: null },
      { data: version, error: null },
    ]);
    const repository = new Repository(context.client);

    await expect(repository.findTenantDetail({
      tenantId: TENANT_ID,
      noteId: NOTE_ID,
    })).resolves.toEqual(tenantDetailRow);
    await expect(repository.findTenantVersionDetail({
      tenantId: TENANT_ID,
      noteId: NOTE_ID,
      versionId: VERSION_ID,
    })).resolves.toEqual(version);

    const [noteSelect, versionSelect] = selects(context.calls);
    expect(noteSelect).not.toContain('content_blocks');
    expect(versionSelect).toContain('content_blocks');
    expectScope(context.calls, [
      { method: 'eq', args: ['tenant_id', TENANT_ID] },
      { method: 'eq', args: ['note_id', NOTE_ID] },
      { method: 'eq', args: ['id', VERSION_ID] },
    ]);
  });

});
