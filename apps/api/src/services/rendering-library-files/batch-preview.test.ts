import { expect, test } from 'bun:test';
import { RenderingLibraryBatchPreviewResultSchema } from '@gooes/domain';
import { makeAuth, makeRepositoryFixture, tenantId, otherTenantId } from '@/services/tenant-rendering-library/test-fixtures';
import { makeFilesFixture } from './test-fixtures';

async function fixture(count = 20) {
  const store = await makeFilesFixture();
  const source = makeRepositoryFixture().source;
  const ids = Array.from({ length: count }, () => crypto.randomUUID());
  for (const id of ids) store.files.set(id, { ...source, id, object_key: `private/renovation-styles/${tenantId}/${id}.webp` });
  return { ...store, ids };
}

test('20-item batch uses one DB query/config/COS instance and preserves request order and expiry', async () => {
  const { service, ids, events, io } = await fixture();
  const file_ids = ids.toReversed();
  const before = Date.now();
  const result = await service.previews(makeAuth({ permissions: [{ code: 'rendering_library.read', scope: 'all' }] }), { file_ids });
  expect(RenderingLibraryBatchPreviewResultSchema.parse(result)).toEqual(result);
  expect(result.items.map((item) => item.file_id)).toEqual(file_ids);
  expect(new Set(result.items.map((item) => item.expires_at)).size).toBe(1);
  expect(Date.parse(result.items[0]!.expires_at)).toBeGreaterThanOrEqual(before + 118000);
  expect(Date.parse(result.items[0]!.expires_at)).toBeLessThanOrEqual(Date.now() + 120000);
  expect(io).toEqual({ database: 1, cos: 1 });
  expect(events).toEqual(['find-batch', 'config', ...Array(20).fill('preview')]);
  result.items.forEach((item) => expect(new URL(item.url).pathname).toBe(`/private/renovation-styles/${tenantId}/${item.file_id}.webp`));
  for (const item of result.items) {
    const signedExpiry = Number(new URL(item.url).searchParams.get('q-sign-time')?.split(';')[1]) * 1000;
    expect(Date.parse(item.expires_at)).toBeLessThanOrEqual(signedExpiry);
  }
});

test('batch requires read all and an employee before input validation or any IO', async () => {
  const { service, events, io } = await fixture();
  for (const auth of [makeAuth({ tenantId: null }), makeAuth({ employeeId: null }), makeAuth({ permissions: [] }),
    makeAuth({ isPlatformAdmin: true, permissions: [{ code: 'platform.picture.read', scope: 'all' }] }),
    ...(['self', 'department', 'assigned'] as const).map((scope) => makeAuth({ permissions: [{ code: 'rendering_library.read', scope }] }))]) {
    await expect(service.previews(auth, { file_ids: [] })).rejects.toMatchObject({ statusCode: 403 });
  }
  expect(events).toEqual([]);
  expect(io).toEqual({ database: 0, cos: 0 });
});

test('batch independently rejects empty/oversize/duplicate/invalid IDs and client authority fields', async () => {
  const { service, ids, events } = await fixture();
  for (const input of [{ file_ids: [] }, { file_ids: Array.from({ length: 101 }, () => crypto.randomUUID()) },
    { file_ids: [ids[0], ids[0]] }, { file_ids: ['bad'] }, { file_ids: ids, tenant_id: otherTenantId },
    { file_ids: ids, url: 'https://public.example.com' }, { file_ids: ids, ttl: 9999 }]) {
    await expect(service.previews(makeAuth(), input)).rejects.toMatchObject({ statusCode: 400 });
  }
  expect(events).toEqual([]);
});

test('every item must be eligible before any signing; final-item failures reject the whole batch', async () => {
  for (const patch of [{ tenant_id: otherTenantId }, { visibility: 'public' }, { scene: 'other' },
    { status: 'migrating' }, { provider: 'supabase' }, { owner_id: otherTenantId }, { mime_type: 'image/jpeg' },
    { public_url: 'https://public.example.com' }, { legacy_url: 'https://legacy.example.com' }, { legacy_path: 'old' },
    { width: 0 }, { object_key: 'private/wrong' }, { deleted_at: '2026-09-11T00:00:00Z' }]) {
    const { service, ids, files, events, io } = await fixture(2);
    Object.assign(files.get(ids[1]!)!, patch);
    await expect(service.previews(makeAuth(), { file_ids: ids })).rejects.toMatchObject({ statusCode: 404, code: 'RENDERING_STYLE_FILE_NOT_FOUND' });
    expect(events).toEqual(['find-batch']);
    expect(io).toEqual({ database: 1, cos: 0 });
  }
  const { service, ids, files, events } = await fixture(2);
  files.delete(ids[1]!);
  await expect(service.previews(makeAuth(), { file_ids: ids })).rejects.toMatchObject({ statusCode: 404 });
  expect(events).toEqual(['find-batch']);
});

test('DB/config/sign errors reject the whole batch with fixed errors and no retries', async () => {
  for (const [fail, statusCode, code, message] of [
    ['find-batch', 500, 'DB_ERROR', '读取装修效果素材文件失败'],
    ['config', 503, 'RENDERING_STORAGE_UNAVAILABLE', '装修效果素材存储暂不可用'],
    ['preview', 502, 'RENDERING_STORAGE_FAILED', '装修效果素材存储操作失败'],
  ] as const) {
    const { service, ids, state, events, io } = await fixture(2);
    state.fail = fail;
    await expect(service.previews(makeAuth(), { file_ids: ids })).rejects.toMatchObject({ statusCode, code, message, details: undefined });
    expect(io.database).toBe(1);
    expect(events.filter((event) => event === fail)).toHaveLength(1);
  }
});
