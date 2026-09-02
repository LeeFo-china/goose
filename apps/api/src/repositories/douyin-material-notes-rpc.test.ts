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
const previewVersion = {
  title: '装修开工清单',
  summary: '开工前检查事项',
  category: '施工避坑',
  category_id: CATEGORY_ID,
  applicable_to: null,
};
const publicInput = {
  tenantId: TENANT_ID,
  installationId: INSTALLATION_ID,
  subjectHash: SUBJECT_HASH,
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
      material: {
        id: NOTE_ID,
        version: 1,
        ...previewVersion,
        content_blocks: [...blocks, {
          type: 'image' as const,
          fileId: IMAGE_FILE_ID,
          alt: '开工材料清单图片',
        }],
      },
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
      p_category_id: CATEGORY_ID,
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
