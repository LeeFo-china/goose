import { beforeAll, describe, expect, mock, test } from 'bun:test';

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
const CLAIM_ID = '44444444-4444-4444-8444-444444444444';
const SUBJECT_HASH = 'a'.repeat(64);
const NOW = '2026-09-01T08:00:00.000Z';
const identity = {
  tenantId: TENANT_ID,
  installationId: INSTALLATION_ID,
  subjectHash: SUBJECT_HASH,
};
const accessRow = {
  id: CLAIM_ID,
  note: { id: NOTE_ID, status: 'withdrawn' as const },
};
const detailRow = {
  id: CLAIM_ID,
  claimed_at: NOW,
  note: { id: NOTE_ID, status: 'archived' as const },
  claimed_version: {
    version_no: 1,
    title: '装修开工清单',
    summary: '开工检查事项',
    category: '施工避坑',
    applicable_to: null,
    content_blocks: [{ type: 'paragraph' as const, text: '确认施工图纸。' }],
  },
};

type Call = { readonly method: string; readonly args: readonly unknown[] };

function clientWith(results: DouyinMaterialNotesDatabaseResult[]) {
  const calls: Call[] = [];
  let index = 0;
  class Query implements DouyinMaterialNotesQuery {
    private record(method: string, args: readonly unknown[]) {
      calls.push({ method, args });
      return this;
    }
    select(...args: unknown[]) { return this.record('select', args); }
    eq(...args: unknown[]) { return this.record('eq', args); }
    is(...args: unknown[]) { return this.record('is', args); }
    in(...args: unknown[]) { return this.record('in', args); }
    or(...args: unknown[]) { return this.record('or', args); }
    order(...args: unknown[]) { return this.record('order', args); }
    range(...args: unknown[]) { return this.record('range', args); }
    limit(...args: unknown[]) { return this.record('limit', args); }
    insert(...args: unknown[]) { return this.record('insert', args); }
    update(...args: unknown[]) { return this.record('update', args); }
    maybeSingle() {
      calls.push({ method: 'maybeSingle', args: [] });
      return Promise.resolve(results[index++] ?? { data: null, error: null });
    }
    single() {
      calls.push({ method: 'single', args: [] });
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
    rpc: mock(() => Promise.resolve({ data: null, error: null })),
  };
  return { calls, client };
}

describe('DouyinMaterialNotesRepository owned body boundary', () => {
  test('checks active ownership and note status without selecting locked content', async () => {
    const context = clientWith([{ data: accessRow, error: null }]);
    await expect(new Repository(context.client).findOwnedAccess({
      ...identity,
      claimId: CLAIM_ID,
    })).resolves.toEqual(accessRow);

    const select = String(context.calls.find((call) => call.method === 'select')?.args[0]);
    expect(select).toContain('id,note:');
    expect(select).not.toMatch(/content_blocks|claimed_version/);
    expect(context.calls).toContainEqual({ method: 'eq', args: ['tenant_id', TENANT_ID] });
    expect(context.calls).toContainEqual({
      method: 'eq', args: ['douyin_miniapp_installation_id', INSTALLATION_ID],
    });
    expect(context.calls).toContainEqual({
      method: 'eq', args: ['subject_hash', SUBJECT_HASH],
    });
    expect(context.calls).toContainEqual({ method: 'is', args: ['removed_at', null] });
    expect(context.calls).toContainEqual({ method: 'eq', args: ['id', CLAIM_ID] });
  });

  test('reads bodies only through an inner published-or-archived status filter', async () => {
    const context = clientWith([{ data: detailRow, error: null }]);
    await expect(new Repository(context.client).findOwnedDetail({
      ...identity,
      claimId: CLAIM_ID,
    })).resolves.toEqual(detailRow);

    const select = String(context.calls.find((call) => call.method === 'select')?.args[0]);
    expect(select).toContain('!inner(id,status)');
    expect(select).toContain('content_blocks');
    expect(context.calls).toContainEqual({
      method: 'in', args: ['note.status', ['published', 'archived']],
    });
  });

  test('returns null when a status race removes the eligible body row', async () => {
    const context = clientWith([{ data: null, error: null }]);
    await expect(new Repository(context.client).findOwnedDetail({
      ...identity,
      claimId: CLAIM_ID,
    })).resolves.toBeNull();
    expect(context.calls).toContainEqual({
      method: 'in', args: ['note.status', ['published', 'archived']],
    });
  });

  test('rejects malformed body-free access rows', async () => {
    const context = clientWith([{
      data: { ...accessRow, note: { ...accessRow.note, id: 'bad' } },
      error: null,
    }]);
    await expect(new Repository(context.client).findOwnedAccess({
      ...identity,
      claimId: CLAIM_ID,
    })).rejects.toMatchObject({
      statusCode: 500,
      code: 'MATERIAL_NOTE_REPOSITORY_RESPONSE_INVALID',
    });
  });
});
