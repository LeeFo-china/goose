import { expect, test } from 'bun:test';
import { RenderingLibraryStyleSchema } from '@gooes/domain';
import { createInput, fileId, makeAuth, makeRepositoryFixture, otherTenantId, styleId, tenantId } from './test-fixtures';
process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

async function fixture() {
  const { TenantRenderingLibraryService } = await import('./service');
  const { accessPolicyService } = await import('@/services/access-policy');
  const data = makeRepositoryFixture();
  return { ...data, service: new TenantRenderingLibraryService({ repository: data.repository, accessPolicy: accessPolicyService }) };
}

test('private draft lifecycle preserves omitted metadata, applies CAS and returns explicit DTOs', async () => {
  const { service, rows, calls } = await fixture();
  const auth = makeAuth();
  expect(await service.create(auth, createInput)).toMatchObject({ id: styleId, tenant_id: tenantId, status: 'draft', version: 1,
    published_version: null, published_at: null, published_by_employee_id: null });
  expect(calls).toContainEqual(['create', tenantId, fileId, createInput]);
  expect(await service.get(auth, styleId)).not.toHaveProperty('deleted_at');
  const updated = await service.update(auth, styleId, { expected_version: 1, title: '新客厅' });
  expect(updated).toMatchObject({ title: '新客厅', color_notes: '暖色', material_notes: '木质', version: 2 });
  expect(await service.hide(auth, styleId, { expected_version: 2 })).toMatchObject({ status: 'hidden', version: 3 });
  expect(await service.remove(auth, styleId, { expected_version: 3 })).toEqual({ id: styleId, deleted: true });
  expect(rows.get(styleId)).toMatchObject({ status: 'hidden', version: 4, deleted_at: expect.any(String) });
  await expect(service.get(auth, styleId)).rejects.toMatchObject({ statusCode: 404, code: 'RENDERING_STYLE_NOT_FOUND' });
  expect(calls.filter(([name]) => name === 'file')).toHaveLength(1);
});

test('list, get, update, hide and remove preserve publication summary without exposing snapshot storage', async () => {
  const { service, rows } = await fixture();
  const auth = makeAuth();
  await service.create(auth, createInput);
  const row = rows.get(styleId)!;
  const summary = { published_version: 2, published_at: '2026-09-13T00:00:00Z', published_by_employee_id: fileId };
  Object.assign(row, summary, { status: 'published', version: 2,
    published_file_id: fileId, public_url: 'https://cdn.secret.test/x', object_key: 'public/secret' });
  for (const dto of [(await service.list(auth, {})).list[0], await service.get(auth, styleId),
    await service.update(auth, styleId, { expected_version: 2, title: '新版本' }),
    await service.hide(auth, styleId, { expected_version: 3 })]) {
    expect(dto).toMatchObject(summary);
    expect(RenderingLibraryStyleSchema.safeParse(dto).success).toBe(true);
  }
  expect(await service.remove(auth, styleId, { expected_version: 4 })).toEqual({ id: styleId, deleted: true });
  expect(rows.get(styleId)).toMatchObject(summary);
});

test('lists with defaults and explicit pagination, and isolates tenant detail', async () => {
  const { service } = await fixture();
  await service.create(makeAuth(), createInput);
  expect(await service.list(makeAuth(), {})).toMatchObject({ list: [{ id: styleId }],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
  expect(await service.list(makeAuth(), { page: 2, pageSize: 1 })).toEqual({ list: [],
    pagination: { page: 2, pageSize: 1, total: 1, totalPages: 1 } });
  await expect(service.get(makeAuth({ tenantId: otherTenantId }), styleId)).rejects.toMatchObject({ statusCode: 404 });
});

test('all methods require tenant employee and read all; writes additionally require manage all', async () => {
  const { service, calls } = await fixture();
  const denied = [makeAuth({ tenantId: null }), makeAuth({ employeeId: null }), makeAuth({ permissions: [] }),
    makeAuth({ isPlatformAdmin: true, permissions: [{ code: 'platform.picture.read', scope: 'all' },
      { code: 'platform.picture.manage', scope: 'all' }] }),
    ...(['self', 'department', 'assigned'] as const).map((scope) => makeAuth({ permissions: [
      { code: 'rendering_library.read', scope }, { code: 'rendering_library.manage', scope: 'all' }] }))];
  for (const auth of denied) {
    for (const call of [() => service.list(auth, {}), () => service.get(auth, styleId),
      () => service.create(auth, createInput), () => service.update(auth, styleId, { expected_version: 1, title: '新' }),
      () => service.hide(auth, styleId, { expected_version: 1 }), () => service.remove(auth, styleId, { expected_version: 1 })]) {
      await expect(call()).rejects.toMatchObject({ statusCode: 403 });
    }
  }
  for (const scope of [null, 'self', 'department', 'assigned'] as const) {
    const auth = makeAuth({ permissions: [{ code: 'rendering_library.read', scope: 'all' },
      ...(scope ? [{ code: 'rendering_library.manage', scope }] : [])] });
    for (const call of [() => service.create(auth, createInput),
      () => service.update(auth, styleId, { expected_version: 1, title: '新' }),
      () => service.hide(auth, styleId, { expected_version: 1 }), () => service.remove(auth, styleId, { expected_version: 1 })]) {
      await expect(call()).rejects.toMatchObject({ statusCode: 403 });
    }
  }
  expect(calls).toEqual([]);
  expect(await service.list(makeAuth({ permissions: [{ code: 'rendering_library.read', scope: 'all' }] }), {}))
    .toMatchObject({ list: [] });
});

test('create rejects every source eligibility boundary before writing', async () => {
  for (const patch of [{ tenant_id: otherTenantId }, { id: styleId }, { status: 'pending' },
    { deleted_at: '2026-09-11T00:00:00Z' }, { visibility: 'public' }, { scene: 'other' },
    { size_bytes: 0 }, { size_bytes: 10 * 1024 * 1024 + 1 }, { mime_type: 'image/gif' },
    { object_key: `private/renovation-styles/${otherTenantId}/source.jpg` }, { object_key: `private/renovation-styles/${tenantId}extra/source.jpg` },
    { provider: 'supabase' }, { owner_type: 'employee' }, { owner_id: otherTenantId }, { owner_id: null },
    { width: 0 }, { height: null }, { width: 4097, height: 4096 }, { width: 1.5 },
    { mime_type: 'image/jpeg' }, { mime_type: 'image/png' }, { status: 'migrating' },
    { object_key: `private/renovation-styles/${tenantId}/source.webp` },
    { object_key: `private/renovation-styles/${tenantId}/${fileId}.webp/../other` },
    { public_url: 'https://public.test' }, { legacy_url: 'https://legacy.test' }, { legacy_path: '/old' }]) {
    const { service, source, calls } = await fixture();
    Object.assign(source, patch);
    await expect(service.create(makeAuth(), createInput)).rejects.toMatchObject({ statusCode: 404, code: 'RENDERING_STYLE_FILE_NOT_FOUND' });
    expect(calls.some(([name]) => name === 'create')).toBe(false);
  }
  const { service, repository } = await fixture();
  repository.findSourceFile = async () => null;
  await expect(service.create(makeAuth(), createInput)).rejects.toMatchObject({ code: 'RENDERING_STYLE_FILE_NOT_FOUND' });
  for (const mime of ['image/webp']) {
    const valid = await fixture();
    valid.source.mime_type = mime;
    valid.source.size_bytes = 10 * 1024 * 1024;
    valid.source.width = 4096;
    valid.source.height = 4096;
    expect(await valid.service.create(makeAuth(), createInput)).toMatchObject({ status: 'draft' });
  }
});

test('private draft creation still permits legacy missing checksum before publication', async () => {
  const { service, source } = await fixture();
  source.checksum = null;
  expect(await service.create(makeAuth(), createInput)).toMatchObject({ status: 'draft', published_version: null });
});

test('service independently validates request bodies, ids and queries', async () => {
  const { service, calls } = await fixture();
  for (const call of [() => service.list(makeAuth(), { pageSize: 101 }),
    () => service.list(makeAuth(), { tenant_id: otherTenantId }), () => service.get(makeAuth(), 'invalid'),
    () => service.create(makeAuth(), { ...createInput, status: 'published' }),
    () => service.update(makeAuth(), styleId, { expected_version: 1 }),
    () => service.update(makeAuth(), styleId, { expected_version: 1, file_id: styleId }),
    () => service.hide(makeAuth(), styleId, { expected_version: 0 }),
    () => service.remove(makeAuth(), styleId, { expected_version: 1, tenant_id: otherTenantId })]) {
    await expect(call()).rejects.toMatchObject({ statusCode: 400 });
  }
  expect(calls).toEqual([]);
});

test('CAS miss distinguishes stale version from missing or foreign record', async () => {
  const { service } = await fixture();
  await service.create(makeAuth(), createInput);
  for (const auth of [makeAuth(), makeAuth({ tenantId: otherTenantId })]) {
    for (const call of [() => service.update(auth, styleId, { expected_version: 9, title: '新' }),
      () => service.hide(auth, styleId, { expected_version: 9 }), () => service.remove(auth, styleId, { expected_version: 9 })]) {
      await expect(call()).rejects.toMatchObject({ code: auth.tenantId === tenantId
        ? 'RENDERING_STYLE_VERSION_CONFLICT' : 'RENDERING_STYLE_NOT_FOUND', statusCode: auth.tenantId === tenantId ? 409 : 404 });
    }
  }
});
