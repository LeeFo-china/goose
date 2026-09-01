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
    or(...args: unknown[]) { return this.call('or', args); }
    order(...args: unknown[]) { return this.call('order', args); }
    range(...args: unknown[]) { return this.call('range', args); }
    limit(...args: unknown[]) { return this.call('limit', args); }
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
    const context = clientWith([
      { data: [versionSummary], error: null, count: 1 },
      { data: version, error: null },
    ]);
    const repository = new Repository(context.client);
    await expect(repository.listVersions({
      tenantId: TENANT_ID, noteId: NOTE_ID, page: 1, pageSize: 20,
    })).resolves.toEqual({ rows: [versionSummary], total: 1 });
    await expect(repository.findTenantVersionDetail({
      tenantId: TENANT_ID, noteId: NOTE_ID, versionId: VERSION_ID,
    })).resolves.toEqual(version);

    expect(selects(context.calls)[0]).not.toContain('content_blocks');
    expect(selects(context.calls)[1]).toContain('content_blocks');
    expect(context.calls).toContainEqual({
      method: 'order', args: ['created_at', { ascending: false }],
    });
    expect(context.calls).toContainEqual({
      method: 'order', args: ['id', { ascending: false }],
    });
    expectScope(context.calls, [
      { method: 'eq', args: ['tenant_id', TENANT_ID] },
      { method: 'eq', args: ['note_id', NOTE_ID] },
      { method: 'eq', args: ['id', VERSION_ID] },
    ]);
  });
});

describe('DouyinMaterialNotesRepository RPC gateway', () => {
  const draft = { ...previewVersion, content_blocks: blocks };
  const transitionInput = {
    tenantId: TENANT_ID,
    noteId: NOTE_ID,
    actorEmployeeId: EMPLOYEE_ID,
    command: 'publish' as const,
    targetVersionId: VERSION_ID,
    expectedStatus: 'draft' as const,
    reason: null,
    idempotencyKey: IDEMPOTENCY_KEY,
  };

  test('strictly enforces every transition publication shape', async () => {
    const invalidResults = [
      { note_id: NOTE_ID, status: 'draft', published_version_id: VERSION_ID, published_at: NOW },
      { note_id: NOTE_ID, status: 'published', published_version_id: null, published_at: NOW },
      { note_id: NOTE_ID, status: 'archived', published_version_id: VERSION_ID, published_at: null },
      { note_id: NOTE_ID, status: 'withdrawn', published_version_id: null, published_at: NOW },
    ];
    for (const data of invalidResults) {
      const context = clientWith([{ data, error: null }]);
      await expect(new Repository(context.client).transition(transitionInput))
        .rejects.toMatchObject({ code: 'MATERIAL_NOTE_REPOSITORY_RESPONSE_INVALID' });
    }
  });

  test('calls all atomic RPCs including service-only erasure with exact identity args', async () => {
    const draftResult = {
      note_id: NOTE_ID, version_id: VERSION_ID, version_no: 1, status: 'draft',
    };
    const claimResult = {
      claim_id: CLAIM_ID,
      already_claimed: false,
      claimed_at: NOW,
      material: { id: NOTE_ID, version: 1, ...previewVersion, content_blocks: blocks },
    };
    const context = clientWith([
      { data: draftResult, error: null },
      { data: { ...draftResult, version_no: 2 }, error: null },
      { data: {
        note_id: NOTE_ID,
        status: 'published',
        published_version_id: VERSION_ID,
        published_at: NOW,
      }, error: null },
      { data: claimResult, error: null },
      { data: { removed: true }, error: null },
      { data: { removed_count: 2 }, error: null },
      { data: { deleted_claim_count: 1, deleted_event_count: 3 }, error: null },
    ]);
    const repository = new Repository(context.client);
    await repository.create({ tenantId: TENANT_ID, actorEmployeeId: EMPLOYEE_ID, draft });
    await repository.appendVersion({
      tenantId: TENANT_ID, noteId: NOTE_ID, actorEmployeeId: EMPLOYEE_ID, draft,
    });
    await repository.transition(transitionInput);
    await repository.claim({ ...publicInput, noteId: NOTE_ID });
    await repository.remove({ ...publicInput, claimId: CLAIM_ID });
    await repository.clear(publicInput);
    await expect(repository.eraseSubjectData(publicInput)).resolves.toEqual({
      deleted_claim_count: 1,
      deleted_event_count: 3,
    });

    const rpcCalls = context.calls.filter((call) => call.method === 'rpc');
    expect(rpcCalls.map((call) => call.args[0])).toEqual([
      'create_douyin_material_note',
      'append_douyin_material_note_version',
      'execute_douyin_material_note_state_command',
      'claim_douyin_material_note',
      'remove_douyin_material_note_claim',
      'clear_douyin_material_note_claims',
      'erase_douyin_material_note_subject_data',
    ]);
    expect(rpcCalls[6]?.args[1]).toEqual({
      p_tenant_id: TENANT_ID,
      p_douyin_miniapp_installation_id: INSTALLATION_ID,
      p_subject_hash: SUBJECT_HASH,
    });
    expect(rpcCalls[3]?.args[1]).toEqual({
      p_tenant_id: TENANT_ID,
      p_douyin_miniapp_installation_id: INSTALLATION_ID,
      p_subject_hash: SUBJECT_HASH,
      p_note_id: NOTE_ID,
    });
    const draftArgs = {
      p_tenant_id: TENANT_ID,
      p_actor_employee_id: EMPLOYEE_ID,
      p_title: draft.title,
      p_summary: draft.summary,
      p_category: draft.category,
      p_applicable_to: null,
      p_content_blocks: blocks,
    };
    expect(rpcCalls[0]?.args[1]).toEqual(draftArgs);
    expect(rpcCalls[1]?.args[1]).toEqual({ p_note_id: NOTE_ID, ...draftArgs });
    expect(rpcCalls[2]?.args[1]).toEqual({
      p_tenant_id: TENANT_ID,
      p_note_id: NOTE_ID,
      p_actor_employee_id: EMPLOYEE_ID,
      p_command: 'publish',
      p_target_version_id: VERSION_ID,
      p_expected_status: 'draft',
      p_reason: null,
      p_idempotency_key: IDEMPOTENCY_KEY,
    });
    expect(rpcCalls[4]?.args[1]).toEqual({
      p_tenant_id: TENANT_ID,
      p_douyin_miniapp_installation_id: INSTALLATION_ID,
      p_subject_hash: SUBJECT_HASH,
      p_claim_id: CLAIM_ID,
    });
    expect(rpcCalls[5]?.args[1]).toEqual({
      p_tenant_id: TENANT_ID,
      p_douyin_miniapp_installation_id: INSTALLATION_ID,
      p_subject_hash: SUBJECT_HASH,
    });
  });

  test('maps SQL markers and strictly rejects malformed command results', async () => {
    for (const marker of [
      'MATERIAL_NOTE_TENANT_NOT_FOUND',
      'MATERIAL_NOTE_INSTALLATION_NOT_FOUND',
    ] as const) {
      const context = clientWith([{
        data: null,
        error: { code: 'P0001', message: marker },
      }]);
      await expect(new Repository(context.client).eraseSubjectData(publicInput))
        .rejects.toMatchObject({ code: marker });
    }
    const withdrawn = clientWith([{
      data: null,
      error: { code: 'P0001', message: 'MATERIAL_NOTE_WITHDRAWN' },
    }]);
    await expect(new Repository(withdrawn.client).claim({
      ...publicInput, noteId: NOTE_ID,
    })).rejects.toMatchObject({ code: 'MATERIAL_NOTE_WITHDRAWN', statusCode: 410 });

    const malformed = clientWith([{
      data: { deleted_claim_count: -1, deleted_event_count: 0 },
      error: null,
    }]);
    await expect(new Repository(malformed.client).eraseSubjectData(publicInput))
      .rejects.toMatchObject({ code: 'MATERIAL_NOTE_REPOSITORY_RESPONSE_INVALID' });
  });
});
