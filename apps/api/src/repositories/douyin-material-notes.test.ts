import { beforeAll, describe, expect, mock, test } from 'bun:test';
import type { DouyinMaterialNoteContentBlocks } from '@gooes/domain';

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
  ({ DouyinMaterialNotesRepository: Repository } = await import(
    './douyin-material-notes'
  ));
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
const previewVersion = {
  title: version.title,
  summary: version.summary,
  category: version.category,
  applicable_to: null,
};

type Call = { readonly method: string; readonly args: readonly unknown[] };

function createClient(results: DouyinMaterialNotesDatabaseResult[]) {
  const calls: Call[] = [];
  let index = 0;
  class Query implements DouyinMaterialNotesQuery {
    private call(method: string, args: readonly unknown[]) {
      calls.push({ method, args });
      return this;
    }
    select(...args: unknown[]) { return this.call('select', args); }
    eq(...args: unknown[]) { return this.call('eq', args); }
    neq(...args: unknown[]) { return this.call('neq', args); }
    is(...args: unknown[]) { return this.call('is', args); }
    in(...args: unknown[]) { return this.call('in', args); }
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

function selectStrings(calls: readonly Call[]) {
  return calls.filter((call) => call.method === 'select')
    .map((call) => String(call.args[0]));
}

describe('DouyinMaterialNotesRepository query boundaries', () => {
  test('public list uses stable pagination and never selects content blocks', async () => {
    const row = {
      id: NOTE_ID,
      published_at: NOW,
      published_version: previewVersion,
      claims: [],
    };
    const context = createClient([{ data: [row], error: null, count: 21 }]);
    const repository = new Repository(context.client);

    await expect(repository.listPublic({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      subjectHash: SUBJECT_HASH,
      page: 2,
      pageSize: 20,
      keyword: '开工',
    })).resolves.toEqual({ rows: [row], total: 21 });

    expect(context.calls).toContainEqual({ method: 'range', args: [20, 39] });
    expect(context.calls).toContainEqual({
      method: 'order', args: ['published_at', { ascending: false }],
    });
    expect(context.calls).toContainEqual({
      method: 'order', args: ['id', { ascending: false }],
    });
    expect(context.calls).toContainEqual({
      method: 'or',
      args: [
        'title.ilike.%开工%,summary.ilike.%开工%,category.ilike.%开工%',
        { referencedTable: 'published_version' },
      ],
    });
    expect(selectStrings(context.calls).join(',')).not.toContain('content_blocks');
    expect(selectStrings(context.calls).join(',')).not.toContain('subject_hash');
  });

  test('tenant and owned lists select preview aggregates and page independently', async () => {
    const tenantRow = {
      id: NOTE_ID,
      status: 'draft' as const,
      published_at: null,
      updated_at: NOW,
      latest_versions: [{ version_no: 1, title: version.title, category: version.category }],
      claims: [{ count: 3 }],
      search_versions: [{ id: VERSION_ID }],
    };
    const ownedRow = {
      id: CLAIM_ID,
      claimed_at: NOW,
      note: { id: NOTE_ID, status: 'archived' },
      claimed_version: { ...previewVersion, version_no: 1 },
    };
    const context = createClient([
      { data: [tenantRow], error: null, count: 1 },
      { data: [ownedRow], error: null, count: 1 },
    ]);
    const repository = new Repository(context.client);

    await repository.listTenant({
      tenantId: TENANT_ID, page: 1, pageSize: 20, status: 'draft', keyword: '开工',
    });
    await repository.listOwned({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      subjectHash: SUBJECT_HASH,
      page: 1,
      pageSize: 20,
    });

    expect(context.calls.filter((call) => call.method === 'range')
      .map((call) => call.args)).toEqual([[0, 19], [0, 19]]);
    expect(context.calls).toContainEqual({
      method: 'limit', args: [1, { referencedTable: 'latest_versions' }],
    });
    expect(context.calls).toContainEqual({ method: 'is', args: ['removed_at', null] });
    expect(context.calls).toContainEqual({
      method: 'order', args: ['updated_at', { ascending: false }],
    });
    expect(context.calls).toContainEqual({
      method: 'order', args: ['claimed_at', { ascending: false }],
    });
    expect(context.calls.filter((call) =>
      call.method === 'order'
      && call.args[0] === 'id'
      && (call.args[1] as { ascending?: boolean }).ascending === false
    )).toHaveLength(2);
    expect(selectStrings(context.calls).join(',')).not.toContain('content_blocks');
    expect(selectStrings(context.calls).join(',')).not.toContain('subject_hash');
  });

  test('strictly rejects malformed nullable fields and missing published relation', async () => {
    const malformed = createClient([{
      data: [{
        id: NOTE_ID,
        published_at: NOW,
        published_version: { ...previewVersion, applicable_to: 8 },
        claims: [],
      }],
      error: null,
      count: 1,
    }]);
    await expect(new Repository(malformed.client).listPublic({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      subjectHash: SUBJECT_HASH,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ code: 'MATERIAL_NOTE_REPOSITORY_RESPONSE_INVALID' });

    const missingRelation = createClient([{
      data: [{ id: NOTE_ID, published_at: NOW, published_version: null, claims: [] }],
      error: null,
      count: 1,
    }]);
    await expect(new Repository(missingRelation.client).listPublic({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      subjectHash: SUBJECT_HASH,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ code: 'MATERIAL_NOTE_REPOSITORY_RESPONSE_INVALID' });
  });

  test('public preview is tenant scoped and selects no locked content', async () => {
    const row = {
      id: NOTE_ID,
      published_at: NOW,
      published_version: previewVersion,
      claims: [{ id: CLAIM_ID }],
    };
    const context = createClient([{ data: row, error: null }]);
    const repository = new Repository(context.client);

    await expect(repository.findPublicPreview({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      subjectHash: SUBJECT_HASH,
      noteId: NOTE_ID,
    })).resolves.toEqual(row);
    expect(context.calls).toContainEqual({ method: 'eq', args: ['id', NOTE_ID] });
    expect(context.calls).toContainEqual({ method: 'maybeSingle', args: [] });
    expect(selectStrings(context.calls).join(',')).not.toContain('content_blocks');
  });

  test('tenant detail and version history parse exact database shapes', async () => {
    const detail = {
      id: NOTE_ID,
      status: 'draft' as const,
      published_version_id: null,
      published_at: null,
      created_at: NOW,
      updated_at: NOW,
      latest_versions: [version],
      claims: [{ count: 0 }],
    };
    const context = createClient([
      { data: detail, error: null },
      { data: [version], error: null, count: 1 },
    ]);
    const repository = new Repository(context.client);

    await expect(repository.findTenantDetail({ tenantId: TENANT_ID, noteId: NOTE_ID }))
      .resolves.toEqual(detail);
    await expect(repository.listVersions({
      tenantId: TENANT_ID, noteId: NOTE_ID, page: 1, pageSize: 20,
    })).resolves.toEqual({ rows: [version], total: 1 });
    expect(context.calls).toContainEqual({
      method: 'order', args: ['version_no', { ascending: false }],
    });
  });
});

describe('DouyinMaterialNotesRepository RPC gateway', () => {
  test('uses exact atomic RPC names and server-owned argument mapping', async () => {
    const draftResult = {
      note_id: NOTE_ID, version_id: VERSION_ID, version_no: 1, status: 'draft',
    };
    const transitionResult = {
      note_id: NOTE_ID,
      status: 'published',
      published_version_id: VERSION_ID,
      published_at: NOW,
    };
    const claimResult = {
      claim_id: CLAIM_ID,
      already_claimed: false,
      claimed_at: NOW,
      material: {
        id: NOTE_ID,
        version: 1,
        ...previewVersion,
        content_blocks: blocks,
      },
    };
    const context = createClient([
      { data: draftResult, error: null },
      { data: { ...draftResult, version_no: 2 }, error: null },
      { data: transitionResult, error: null },
      { data: claimResult, error: null },
      { data: { removed: true }, error: null },
      { data: { removed_count: 2 }, error: null },
    ]);
    const repository = new Repository(context.client);
    const draft = { ...previewVersion, content_blocks: blocks };

    await repository.create({ tenantId: TENANT_ID, actorEmployeeId: EMPLOYEE_ID, draft });
    await repository.appendVersion({
      tenantId: TENANT_ID, noteId: NOTE_ID, actorEmployeeId: EMPLOYEE_ID, draft,
    });
    await repository.transition({
      tenantId: TENANT_ID,
      noteId: NOTE_ID,
      actorEmployeeId: EMPLOYEE_ID,
      command: 'publish',
      targetVersionId: VERSION_ID,
      expectedStatus: 'draft',
      reason: null,
      idempotencyKey: IDEMPOTENCY_KEY,
    });
    await repository.claim({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      subjectHash: SUBJECT_HASH,
      noteId: NOTE_ID,
    });
    await repository.remove({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      subjectHash: SUBJECT_HASH,
      claimId: CLAIM_ID,
    });
    await repository.clear({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      subjectHash: SUBJECT_HASH,
    });

    expect(context.calls.filter((call) => call.method === 'rpc')
      .map((call) => call.args[0])).toEqual([
      'create_douyin_material_note',
      'append_douyin_material_note_version',
      'execute_douyin_material_note_state_command',
      'claim_douyin_material_note',
      'remove_douyin_material_note_claim',
      'clear_douyin_material_note_claims',
    ]);
    expect(context.calls).toContainEqual({ method: 'rpc', args: [
      'claim_douyin_material_note',
      {
        p_tenant_id: TENANT_ID,
        p_douyin_miniapp_installation_id: INSTALLATION_ID,
        p_subject_hash: SUBJECT_HASH,
        p_note_id: NOTE_ID,
      },
    ] });
    expect(context.calls).toContainEqual({ method: 'rpc', args: [
      'create_douyin_material_note',
      {
        p_tenant_id: TENANT_ID,
        p_actor_employee_id: EMPLOYEE_ID,
        p_title: draft.title,
        p_summary: draft.summary,
        p_category: draft.category,
        p_applicable_to: null,
        p_content_blocks: blocks,
      },
    ] });
    expect(context.calls).toContainEqual({ method: 'rpc', args: [
      'append_douyin_material_note_version',
      {
        p_tenant_id: TENANT_ID,
        p_note_id: NOTE_ID,
        p_actor_employee_id: EMPLOYEE_ID,
        p_title: draft.title,
        p_summary: draft.summary,
        p_category: draft.category,
        p_applicable_to: null,
        p_content_blocks: blocks,
      },
    ] });
    expect(context.calls).toContainEqual({ method: 'rpc', args: [
      'execute_douyin_material_note_state_command',
      {
        p_tenant_id: TENANT_ID,
        p_note_id: NOTE_ID,
        p_actor_employee_id: EMPLOYEE_ID,
        p_command: 'publish',
        p_target_version_id: VERSION_ID,
        p_expected_status: 'draft',
        p_reason: null,
        p_idempotency_key: IDEMPOTENCY_KEY,
      },
    ] });
    expect(context.calls).toContainEqual({ method: 'rpc', args: [
      'remove_douyin_material_note_claim',
      {
        p_tenant_id: TENANT_ID,
        p_douyin_miniapp_installation_id: INSTALLATION_ID,
        p_subject_hash: SUBJECT_HASH,
        p_claim_id: CLAIM_ID,
      },
    ] });
    expect(context.calls).toContainEqual({ method: 'rpc', args: [
      'clear_douyin_material_note_claims',
      {
        p_tenant_id: TENANT_ID,
        p_douyin_miniapp_installation_id: INSTALLATION_ID,
        p_subject_hash: SUBJECT_HASH,
      },
    ] });
  });

  test('maps known SQL markers and rejects malformed RPC results safely', async () => {
    const known = createClient([{
      data: null,
      error: { code: 'P0001', message: 'MATERIAL_NOTE_WITHDRAWN' },
    }]);
    await expect(new Repository(known.client).claim({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      subjectHash: SUBJECT_HASH,
      noteId: NOTE_ID,
    })).rejects.toMatchObject({ statusCode: 410, code: 'MATERIAL_NOTE_WITHDRAWN' });

    const malformed = createClient([{
      data: { claim_id: CLAIM_ID, already_claimed: 'false' },
      error: null,
    }]);
    await expect(new Repository(malformed.client).claim({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      subjectHash: SUBJECT_HASH,
      noteId: NOTE_ID,
    })).rejects.toMatchObject({ code: 'MATERIAL_NOTE_REPOSITORY_RESPONSE_INVALID' });
  });
});
