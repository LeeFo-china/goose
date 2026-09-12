import { expect, test } from 'bun:test';
import { createLibraryRequests } from './requests';
import { fileId, style } from './test-fixtures';

test('requests use the existing private proxy with bounded query, strict DTOs and file-only FormData', async () => {
  const calls: Array<{ path: string; init: RequestInit }> = [];
  let data: unknown = { list: [style], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } };
  const api = createLibraryRequests(async (path, init) => { calls.push({ path, init }); return Response.json({ success: true, data }); });
  expect((await api.list({ page: 1, pageSize: 20 })).list).toEqual([style]);
  expect(calls[0]!.path).toBe('/api/backend/tenant/rendering-library/styles?page=1&pageSize=20');
  data = { file_id: fileId, mime_type: 'image/webp', width: 32, height: 24, size_bytes: 42 };
  await api.upload(new File(['x'], 'a.png', { type: 'image/png' }));
  expect([...(calls[1]!.init.body as FormData).keys()]).toEqual(['file']);
  expect(calls.every(({ init }) => init.cache === 'no-store')).toBe(true);
  data = { ...style, object_key: 'private/key' };
  await expect(api.get(style.id)).rejects.toMatchObject({ message: '素材资料响应格式异常' });
});
test('request errors retain stable business codes without leaking backend payloads', async () => {
  const api = createLibraryRequests(async () => Response.json({ success: false, code: 'RENDERING_STYLE_FILE_USED', message: 'secret URL' }, { status: 409 }));
  await expect(api.create({ title: style.title, space: style.space, style: style.style,
    source_type: style.source_type, rights_confirmed: true, file_id: fileId })).rejects.toMatchObject({ code: 'RENDERING_STYLE_FILE_USED' });
});

test('detail can preview an uploaded file outside the current list through the private endpoint', async () => {
  const preview = { file_id: fileId, url: 'https://preview.example.com/signed', expires_at: '2099-09-11T00:00:00Z' };
  const paths: string[] = [];
  const api = createLibraryRequests(async (path) => { paths.push(path); return Response.json({ success: true, data: preview }); });
  expect(await api.preview(fileId)).toEqual(preview);
  expect(paths).toEqual([`/api/backend/tenant/rendering-library/files/${fileId}/preview`]);
});

test('deleted or unavailable styles have a clear fixed recovery error', async () => {
  const api = createLibraryRequests(async () => Response.json({ success: false, code: 'RENDERING_STYLE_NOT_FOUND', message: 'raw detail' }, { status: 404 }));
  await expect(api.update(style.id, { title: '保留本地标题', expected_version: 1 })).rejects.toMatchObject({ status: 404, message: '素材已删除或不可用，请关闭后刷新素材列表' });
});

test('write conflicts ask to reload before acting rather than assuming a save', async () => {
  const api = createLibraryRequests(async () => Response.json({ success: false, code: 'RENDERING_STYLE_VERSION_CONFLICT', message: 'raw' }, { status: 409 }));
  await expect(api.hide(style.id, style.version)).rejects.toMatchObject({ message: '素材已更新，请加载最新资料后再操作' });
});

test('publish idempotency conflicts tell operators to close and start a new attempt', async () => {
  const api = createLibraryRequests(async () => Response.json({ success: false,
    code: 'RENDERING_STYLE_PUBLISH_IDEMPOTENCY_CONFLICT', message: 'raw key detail' }, { status: 409 }));
  await expect(api.publish(style.id, { expected_version: 1,
    idempotency_key: '9d152539-6344-4ad5-8e53-24ae6b3dc0d8', responsibility_confirmed: true }))
    .rejects.toMatchObject({ code: 'RENDERING_STYLE_PUBLISH_IDEMPOTENCY_CONFLICT',
      message: '本次发布标识已用于其他请求，请关闭弹窗后重新发起发布' });
});

test('publish sends a validated version, UUID idempotency key and responsibility confirmation', async () => {
  const calls: Array<{ path: string; init: RequestInit }> = [];
  const api = createLibraryRequests(async (path, init) => {
    calls.push({ path, init });
    return Response.json({ success: true, data: style });
  });
  const key = '9d152539-6344-4ad5-8e53-24ae6b3dc0d8';
  await api.publish(style.id, { expected_version: 2, idempotency_key: key, responsibility_confirmed: true });
  expect(calls).toHaveLength(1);
  expect(calls[0]?.path).toBe(`/api/backend/tenant/rendering-library/styles/${style.id}/publish`);
  expect(calls[0]?.init.method).toBe('POST');
  expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ expected_version: 2, idempotency_key: key, responsibility_confirmed: true });
});
