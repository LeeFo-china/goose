import { beforeAll, describe, expect, mock, test } from 'bun:test';
import type {
  DouyinMaterialNotesDatabaseClient,
  DouyinMaterialNotesDatabaseResult,
  DouyinMaterialNotesQuery,
} from './douyin-material-notes';

let Repository: typeof import('./douyin-material-notes').DouyinMaterialNotesRepository;
beforeAll(async () => {
  ({ DouyinMaterialNotesRepository: Repository } = await import('./douyin-material-notes'));
});

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const IMAGE_FILE_ID = '88888888-8888-4888-8888-888888888888';
const imageAssetRow = {
  id: IMAGE_FILE_ID,
  tenant_id: TENANT_ID,
  public_url: 'https://cdn.goodcms.cn/material-notes/checklist.webp',
  width: 1200,
  height: 800,
  mime_type: 'image/webp',
  status: 'active',
  visibility: 'public',
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
    rpc: mock(() => Promise.resolve({ data: null, error: null })),
  };
  return { client, calls };
}

describe('DouyinMaterialNotesRepository material note image assets', () => {
  test('loads only active public tenant image assets by explicit file ids', async () => {
    const context = clientWith([{ data: [imageAssetRow], error: null }]);

    await expect(new Repository(context.client).findMaterialImageAssets({
      tenantId: TENANT_ID,
      fileIds: [IMAGE_FILE_ID],
    })).resolves.toEqual([imageAssetRow]);

    expect(context.calls).toContainEqual({ method: 'from', args: ['platform_file_objects'] });
    expect(context.calls).toContainEqual({
      method: 'select',
      args: ['id,tenant_id,public_url,width,height,mime_type,status,visibility'],
    });
    for (const call of [
      { method: 'eq', args: ['tenant_id', TENANT_ID] },
      { method: 'in', args: ['id', [IMAGE_FILE_ID]] },
      { method: 'eq', args: ['status', 'active'] },
      { method: 'eq', args: ['visibility', 'public'] },
      { method: 'is', args: ['deleted_at', null] },
    ] as const) {
      expect(context.calls).toContainEqual(call);
    }
  });
});
