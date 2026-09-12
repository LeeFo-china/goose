import { expect, test } from 'bun:test';
import type { TenantRenderingLibraryDatabaseClient } from './tenant-rendering-library';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
const tenantId = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const input = { title: '客厅', space: 'living_room' as const, style: 'cream' as const,
  color_notes: '暖色', material_notes: '木', source_type: 'design' as const,
  rights_confirmed: true as const, file_id: other, sort_order: 0 };
const row = { ...input, id, tenant_id: tenantId, status: 'draft' as const, version: 1,
  published_version: null, published_at: null, published_by_employee_id: null,
  created_by_employee_id: other, created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z' };
const location = { bucket: 'rendering-123456', region: 'ap-guangzhou', object_key: `private/renovation-styles/${tenantId}/${other}.webp` };
const source = { id: other, tenant_id: tenantId, scene: 'rendering_style_source', visibility: 'private',
  status: 'active', deleted_at: null, mime_type: 'image/webp', size_bytes: 1024, ...location,
  provider: 'tencent_cos', owner_type: 'tenant', owner_id: tenantId, width: 32, height: 24,
  public_url: null, legacy_url: null, legacy_path: null, checksum: 'a'.repeat(64) };
const sourceFields = 'id,tenant_id,scene,visibility,status,deleted_at,mime_type,size_bytes,object_key,provider,bucket,region,owner_type,owner_id,width,height,public_url,legacy_url,legacy_path,checksum';
const stageInput = { id: other, tenantId, employeeId: id, authUserId: id, location, sizeBytes: 1024,
  width: 32, height: 24, checksum: 'a'.repeat(64) };

async function fixture(data: unknown, count: unknown = 1, error: unknown = null) {
  const { TenantRenderingLibraryRepository } = await import('./tenant-rendering-library');
  const calls: unknown[][] = [];
  const result = { data, count, error };
  const query = {
    select: (...args: unknown[]) => { calls.push(['select', ...args]); return query; },
    eq: (...args: unknown[]) => { calls.push(['eq', ...args]); return query; },
    is: (...args: unknown[]) => { calls.push(['is', ...args]); return query; },
    in: (...args: unknown[]) => { calls.push(['in', ...args]); return query; },
    limit: (...args: unknown[]) => { calls.push(['limit', ...args]); return query; },
    order: (...args: unknown[]) => { calls.push(['order', ...args]); return query; },
    range: (...args: unknown[]) => { calls.push(['range', ...args]); return query; },
    insert: (...args: unknown[]) => { calls.push(['insert', ...args]); return query; },
    update: (...args: unknown[]) => { calls.push(['update', ...args]); return query; },
    maybeSingle: async () => result,
    single: async () => result,
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  // The Supabase builder is the external boundary; preserve its chaining and result envelope.
  const client = { from: (table: string) => { calls.push(['from', table]); return query; } } as unknown as TenantRenderingLibraryDatabaseClient;
  return { repository: new TenantRenderingLibraryRepository(client), calls, result };
}

test('list selects explicit fields with tenant, live rows, bounded paging and stable order', async () => {
  const { repository, calls } = await fixture([row]);
  expect(await repository.list(tenantId, { page: 2, pageSize: 20, status: 'draft', space: 'living_room', style: 'cream' }))
    .toEqual({ rows: [row], total: 1 });
  for (const call of [['from', 'tenant_rendering_styles'], ['eq', 'tenant_id', tenantId],
    ['is', 'deleted_at', null], ['range', 20, 39], ['eq', 'status', 'draft'],
    ['eq', 'space', 'living_room'], ['eq', 'style', 'cream']]) expect(calls).toContainEqual(call);
  expect(calls.filter(([name]) => name === 'order')).toEqual([
    ['order', 'sort_order', { ascending: true }], ['order', 'id', { ascending: true }],
  ]);
  const select = calls.find(([name]) => name === 'select');
  expect(select?.[1]).not.toContain('*');
  expect(select?.[1]).not.toContain('object_key');
  expect(select?.[1]).toBe('id,tenant_id,title,space,style,color_notes,material_notes,source_type,rights_confirmed,file_id,status,sort_order,version,created_by_employee_id,published_version,published_at,published_by_employee_id,created_at,updated_at');
  expect(select?.[2]).toEqual({ count: 'exact' });
});

test('find and CAS constrain tenant, id, live rows and expected version', async () => {
  const { repository, calls, result } = await fixture(row);
  expect(await repository.find(tenantId, id)).toEqual(row);
  expect(calls).toContainEqual(['eq', 'tenant_id', tenantId]);
  expect(calls).toContainEqual(['eq', 'id', id]);
  expect(calls).toContainEqual(['is', 'deleted_at', null]);
  calls.length = 0;
  await repository.change(tenantId, id, 1, { title: '卧室', status: 'hidden' });
  expect(calls).toContainEqual(['update', { title: '卧室', status: 'hidden', version: 2 }]);
  for (const call of [['eq', 'tenant_id', tenantId], ['eq', 'id', id], ['eq', 'version', 1],
    ['is', 'deleted_at', null]]) expect(calls).toContainEqual(call);
  result.data = null;
  expect(await repository.change(tenantId, id, 1, { status: 'hidden' })).toBeNull();
  expect(await repository.find(tenantId, id)).toBeNull();
});

test('create fixes trusted tenant and employee and maps duplicate conflict without raw database details', async () => {
  const { repository, calls, result } = await fixture(row);
  await repository.create(tenantId, other, input);
  expect(calls).toContainEqual(['insert', { ...input, tenant_id: tenantId, created_by_employee_id: other, status: 'draft' }]);
  result.error = { code: '23505', message: 'secret database details' };
  await expect(repository.create(tenantId, other, input)).rejects.toMatchObject({ statusCode: 409, code: 'RENDERING_STYLE_FILE_USED' });
});

test('repository rejects foreign, invalid and malformed database responses', async () => {
  for (const badRow of [{ ...row, tenant_id: other }, { ...row, status: 'invalid' },
    { ...row, version: 0 }, { ...row, object_key: 'private/secret' }]) {
    const { repository } = await fixture([badRow]);
    await expect(repository.list(tenantId, { page: 1, pageSize: 20 })).rejects.toMatchObject({ code: 'DB_ERROR' });
  }
  for (const count of [null, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    const { repository } = await fixture([], count);
    await expect(repository.list(tenantId, { page: 1, pageSize: 20 })).rejects.toMatchObject({ code: 'DB_ERROR' });
  }
  const { repository } = await fixture({ ...row, id: other });
  await expect(repository.find(tenantId, id)).rejects.toMatchObject({ code: 'DB_ERROR' });
  await expect(repository.change(tenantId, id, 1, { status: 'hidden' })).rejects.toMatchObject({ code: 'DB_ERROR' });
  const failed = await fixture(null, null, { message: 'secret database details' });
  await expect(failed.repository.find(tenantId, id)).rejects.toMatchObject({ code: 'DB_ERROR', message: '读取装修效果素材失败' });
});

test('source lookup selects explicit fields including nullable checksum and rejects malformed or foreign files', async () => {
  const file = source;
  const { repository, calls, result } = await fixture(file);
  expect(await repository.findSourceFile(tenantId, other)).toEqual(file);
  result.data = { ...file, checksum: null };
  expect(await repository.findSourceFile(tenantId, other)).toEqual({ ...file, checksum: null });
  expect(calls).toContainEqual(['from', 'platform_file_objects']);
  expect(calls).toContainEqual(['select', sourceFields]);
  for (const call of [['eq', 'tenant_id', tenantId], ['eq', 'id', other], ['is', 'deleted_at', null]]) expect(calls).toContainEqual(call);
  for (const badFile of [{ ...file, tenant_id: other }, { ...file, id }, { ...file, size_bytes: '1024' }]) {
    result.data = badFile;
    await expect(repository.findSourceFile(tenantId, other)).rejects.toMatchObject({ code: 'DB_ERROR' });
  }
  result.data = null;
  expect(await repository.findSourceFile(tenantId, other)).toBeNull();
});

test('stage persists only unavailable private canonical normalized metadata without any URLs', async () => {
  const staged = { ...source, status: 'migrating' };
  const { repository, calls } = await fixture(staged);
  expect(await repository.stageSourceFile(stageInput)).toEqual(staged);
  expect(calls).toContainEqual(['insert', {
    id: other, tenant_id: tenantId, owner_type: 'tenant', owner_id: tenantId,
    scene: 'rendering_style_source', provider: 'tencent_cos', ...location,
    mime_type: 'image/webp', size_bytes: 1024, width: 32, height: 24, checksum: 'a'.repeat(64),
    visibility: 'private', public_url: null, legacy_url: null, legacy_path: null,
    status: 'migrating', original_name: null, created_by_employee_id: id, created_by_auth_user_id: id,
    metadata: { normalization: 'rendering-webp-v1' },
  }]);
  expect(calls).toContainEqual(['select', sourceFields]);
});

test('known-ID batch source lookup uses one bounded tenant query with explicit fields', async () => {
  const ids = Array.from({ length: 20 }, () => crypto.randomUUID());
  const rows = ids.map((fileId) => ({ ...source, id: fileId }));
  const { repository, calls } = await fixture(rows);
  expect(await repository.findSourceFiles(tenantId, ids)).toEqual(rows);
  expect(calls).toEqual([['from', 'platform_file_objects'], ['select', sourceFields], ['eq', 'tenant_id', tenantId],
    ['in', 'id', ids], ['is', 'deleted_at', null], ['limit', 20]]);
});

test('batch repository validates IDs and bounds independently and empty lookup performs no query', async () => {
  const { repository, calls } = await fixture([]);
  expect(await repository.findSourceFiles(tenantId, [])).toEqual([]);
  for (const ids of [['bad'], [id, id], Array.from({ length: 101 }, () => crypto.randomUUID())]) {
    await expect(repository.findSourceFiles(tenantId, ids)).rejects.toMatchObject({ statusCode: 400 });
  }
  await expect(repository.findSourceFiles('bad', [id])).rejects.toMatchObject({ statusCode: 400 });
  expect(calls).toEqual([]);
});

test('batch source results reject malformed, duplicate, foreign, unsolicited rows and safe DB failures', async () => {
  for (const data of [null, {}, [source, source], [{ ...source, id }], [{ ...source, tenant_id: id }],
    [{ ...source, width: '32' }], [{ ...source, extra: 'private' }]]) {
    const { repository } = await fixture(data);
    await expect(repository.findSourceFiles(tenantId, [other])).rejects.toMatchObject({ code: 'DB_ERROR' });
  }
  const { repository } = await fixture(null, null, { message: 'secret SQL detail' });
  await expect(repository.findSourceFiles(tenantId, [other])).rejects.toMatchObject({
    code: 'DB_ERROR', message: '读取装修效果素材文件失败', details: undefined,
  });
});

test('activation updates only the matching live private staged source and validates the response', async () => {
  const { repository, calls, result } = await fixture(source);
  expect(await repository.activateSourceFile(tenantId, other)).toEqual(source);
  for (const call of [['update', { status: 'active' }], ['eq', 'tenant_id', tenantId], ['eq', 'id', other],
    ['eq', 'scene', 'rendering_style_source'], ['eq', 'status', 'migrating'],
    ['eq', 'visibility', 'private'], ['is', 'deleted_at', null], ['select', sourceFields]]) expect(calls).toContainEqual(call);
  for (const data of [null, { ...source, tenant_id: other }, { ...source, id }, { ...source, status: 'migrating' },
    { ...source, scene: 'other' }, { ...source, visibility: 'public' }, { ...source, deleted_at: '2026-09-11T00:00:00Z' }]) {
    result.data = data;
    await expect(repository.activateSourceFile(tenantId, other)).rejects.toMatchObject({ code: 'DB_ERROR' });
  }
});

test('staging rejects wrong state, identity, metadata or location; DB errors never expose raw details', async () => {
  for (const patch of [{ id }, { tenant_id: other }, { status: 'active' }, { bucket: 'other-123' },
    { region: 'ap-singapore' }, { object_key: 'private/other' }, { width: 99 }, { size_bytes: 1 },
    { visibility: 'public' }, { provider: 'supabase' }, { owner_id: other }, { public_url: 'https://example.com' }]) {
    const { repository } = await fixture({ ...source, status: 'migrating', ...patch });
    await expect(repository.stageSourceFile(stageInput)).rejects.toMatchObject({ code: 'DB_ERROR' });
  }
  const { repository } = await fixture(null, null, { message: 'secret db details' });
  await expect(repository.stageSourceFile(stageInput)).rejects.toMatchObject({ code: 'DB_ERROR', message: '暂存装修效果素材文件失败', details: undefined });
  await expect(repository.activateSourceFile(tenantId, other)).rejects.toMatchObject({ code: 'DB_ERROR', message: '启用装修效果素材文件失败', details: undefined });
});
