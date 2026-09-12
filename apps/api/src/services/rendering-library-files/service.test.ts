import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { RenderingLibraryFileUploadResultSchema, RenderingLibraryFilePreviewResultSchema } from '@gooes/domain';
import { createInput, makeAuth, tenantId, otherTenantId, fileId } from '@/services/tenant-rendering-library/test-fixtures';
import { makeFilesFixture } from './test-fixtures';

test('real normalization, private staging, COS write and activation yield upload→preview→draft', async () => {
  const { service, draftService, files, events, bytes, uploaded } = await makeFilesFixture();
  const result = await service.upload(makeAuth(), { bytes, mimeType: 'image/png' });
  expect(RenderingLibraryFileUploadResultSchema.parse(result)).toEqual(result);
  expect(result.file_id).not.toBe(fileId);
  expect(result).toEqual({ file_id: expect.any(String), mime_type: 'image/webp', size_bytes: uploaded[0]!.length, width: 32, height: 24 });
  expect(events).toEqual(['config', 'stage', 'config', 'put', 'activate']);
  expect((await sharp(uploaded[0]).metadata()).format).toBe('webp');
  expect(files.get(result.file_id)).toMatchObject({ status: 'active', tenant_id: tenantId, owner_id: tenantId,
    created_by_employee_id: fileId, created_by_auth_user_id: fileId,
    object_key: `private/renovation-styles/${tenantId}/${result.file_id}.webp`, public_url: null,
    checksum: createHash('sha256').update(uploaded[0]!).digest('hex'), metadata: { normalization: 'rendering-webp-v1' } });
  const before = Date.now();
  const preview = await service.preview(makeAuth({ employeeId: otherTenantId,
    permissions: [{ code: 'rendering_library.read', scope: 'all' }] }), result.file_id);
  expect(RenderingLibraryFilePreviewResultSchema.parse(preview)).toEqual(preview);
  expect(Date.parse(preview.expires_at)).toBeGreaterThanOrEqual(before + 118000);
  expect(Date.parse(preview.expires_at)).toBeLessThanOrEqual(Date.now() + 120000);
  const signedExpiry = Number(new URL(preview.url).searchParams.get('q-sign-time')?.split(';')[1]) * 1000;
  expect(Date.parse(preview.expires_at)).toBeLessThanOrEqual(signedExpiry);
  expect(new URL(preview.url).searchParams.get('q-signature')).toBeTruthy();
  expect(await draftService.create(makeAuth(), { ...createInput, file_id: result.file_id })).toMatchObject({ status: 'draft', file_id: result.file_id });
});

test('upload and preview enforce trusted employee + all permissions before I/O, without platform bypass', async () => {
  const { service, bytes, events } = await makeFilesFixture();
  const denied = [makeAuth({ tenantId: null }), makeAuth({ employeeId: null }), makeAuth({ permissions: [] }),
    makeAuth({ isPlatformAdmin: true, permissions: [{ code: 'platform.picture.manage', scope: 'all' }] }),
    ...(['self', 'department', 'assigned'] as const).map((scope) => makeAuth({ permissions: [
      { code: 'rendering_library.read', scope }, { code: 'rendering_library.manage', scope: 'all' }] }))];
  for (const auth of denied) {
    expect(() => service.assertUploadAccess(auth)).toThrow();
    await expect(service.upload(auth, { bytes, mimeType: 'image/png' })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.preview(auth, fileId)).rejects.toMatchObject({ statusCode: 403 });
  }
  for (const scope of [null, 'self', 'department', 'assigned'] as const) {
    const auth = makeAuth({ permissions: [{ code: 'rendering_library.read', scope: 'all' },
      ...(scope ? [{ code: 'rendering_library.manage', scope }] : [])] });
    await expect(service.upload(auth, { bytes, mimeType: 'image/png' })).rejects.toMatchObject({ statusCode: 403 });
  }
  await expect(service.preview(makeAuth(), 'bad')).rejects.toMatchObject({ statusCode: 400 });
  await expect(service.upload(makeAuth(), { bytes: Buffer.from('fake'), mimeType: 'image/png' })).rejects.toMatchObject({ statusCode: 422 });
  expect(events).toEqual([]);
});

test('stage, put and activation failures stop the sequence without success, retry or automatic deletion', async () => {
  const expected = { stage: ['config', 'stage'], put: ['config', 'stage', 'config', 'put'],
    activate: ['config', 'stage', 'config', 'put', 'activate'] };
  for (const fail of ['stage', 'put', 'activate'] as const) {
    const { service, bytes, state, events, files } = await makeFilesFixture();
    state.fail = fail;
    await expect(service.upload(makeAuth(), { bytes, mimeType: 'image/png' })).rejects.toMatchObject({ statusCode: fail === 'put' ? 502 : 500 });
    expect(events).toEqual(expected[fail]);
    expect(files.size).toBe(fail === 'stage' ? 0 : 1);
    for (const row of files.values()) expect(row.status).toBe('migrating');
  }
});

test('committed activation with a lost response rejects without retrying or deleting the active row and object', async () => {
  const { service, bytes, state, events, files, uploaded } = await makeFilesFixture();
  state.fail = 'activation_committed_response_lost';
  await expect(service.upload(makeAuth(), { bytes, mimeType: 'image/png' })).rejects.toMatchObject({
    statusCode: 500, code: 'DB_ERROR', message: '启用装修效果素材文件失败', details: undefined,
  });
  expect(events).toEqual(['config', 'stage', 'config', 'put', 'activate']);
  expect(events.filter((event) => event === 'put')).toHaveLength(1);
  expect(events.filter((event) => event === 'activate')).toHaveLength(1);
  expect(files.size).toBe(1);
  expect(uploaded).toHaveLength(1);
  expect(uploaded[0]!.length).toBeGreaterThan(0);
  expect([...files.values()][0]).toMatchObject({
    status: 'active', deleted_at: null, tenant_id: tenantId,
    checksum: createHash('sha256').update(uploaded[0]!).digest('hex'),
  });
});

test('preview rejects foreign tenant and every unavailable or noncanonical source without signing', async () => {
  const { service, bytes, files, events } = await makeFilesFixture();
  const uploaded = await service.upload(makeAuth(), { bytes, mimeType: 'image/png' });
  const original = { ...files.get(uploaded.file_id)! };
  await expect(service.preview(makeAuth({ tenantId: otherTenantId }), uploaded.file_id)).rejects.toMatchObject({ statusCode: 404 });
  for (const patch of [{ status: 'migrating' }, { status: 'pending' }, { visibility: 'public' }, { scene: 'other' },
    { provider: 'supabase' }, { owner_type: 'employee' }, { owner_id: otherTenantId }, { mime_type: 'image/jpeg' },
    { public_url: 'https://example.com' }, { legacy_url: 'https://old.test' }, { legacy_path: 'old' },
    { width: 0 }, { height: null }, { width: 4097, height: 4096 }, { size_bytes: 0 }, { size_bytes: 10485761 },
    { deleted_at: '2026-09-11T00:00:00Z' }, { object_key: `private/renovation-styles/${tenantId}/other.webp` }]) {
    files.set(uploaded.file_id, { ...original, ...patch });
    events.length = 0;
    await expect(service.preview(makeAuth(), uploaded.file_id)).rejects.toMatchObject({ statusCode: 404, code: 'RENDERING_STYLE_FILE_NOT_FOUND' });
    expect(events).toEqual(['find']);
  }
});
