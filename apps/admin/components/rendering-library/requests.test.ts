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
