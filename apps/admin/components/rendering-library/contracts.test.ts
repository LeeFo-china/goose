import { expect, test } from 'bun:test';
import { getLibraryAccess, SPACE_LABELS, STYLE_LABELS, SOURCE_LABELS, LibraryListResultSchema, validateUploadFiles } from './contracts';

const identity = { tenant: { id: 'tenant' }, employee: { id: 'employee' }, permissions: [
  { code: 'rendering_library.read', scope: 'all' as const }, { code: 'rendering_library.manage', scope: 'all' as const },
] };
test('tenant employee and exact all scopes are required, without platform bypass', () => {
  expect(getLibraryAccess(identity)).toEqual({ canRead: true, canManage: true });
  expect(getLibraryAccess(null)).toEqual({ canRead: false, canManage: false });
  for (const patch of [{ tenant: null }, { employee: { id: null } }, { permissions: [] },
    { permissions: [{ code: 'rendering_library.read', scope: 'self' as const }] }]) {
    expect(getLibraryAccess({ ...identity, ...patch }).canRead).toBe(false);
  }
  expect(getLibraryAccess({ ...identity, permissions: [{ code: 'rendering_library.read', scope: 'all' }] }))
    .toEqual({ canRead: true, canManage: false });
  for (const scope of ['self', 'assigned', 'department'] as const) {
    expect(getLibraryAccess({ ...identity, permissions: [identity.permissions[0]!, { code: 'rendering_library.manage', scope }] }).canManage).toBe(false);
  }
});
test('labels distinguish source provenance and use canonical Chinese options', () => {
  expect(SPACE_LABELS).toEqual({ living_room: '客厅', bedroom: '卧室' });
  expect(Object.keys(STYLE_LABELS)).toHaveLength(9);
  expect(SOURCE_LABELS).toEqual({ real_case: '实景案例', design: '设计效果图', ai_concept: 'AI 概念图' });
});
test('list responses are strict and pagination stays bounded', () => {
  const result = { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
  expect(LibraryListResultSchema.parse(result)).toEqual(result);
  expect(LibraryListResultSchema.safeParse({ ...result, url: 'private' }).success).toBe(false);
  expect(LibraryListResultSchema.safeParse({ ...result, pagination: { ...result.pagination, pageSize: 101 } }).success).toBe(false);
});
test('file selection is validated before requests, with at most 20 supported nonempty files', () => {
  const png = new File(['png'], '客厅.png', { type: 'image/png' });
  expect(validateUploadFiles([png])).toBeNull();
  for (const files of [[], Array(21).fill(png), [new File([], 'empty.png', { type: 'image/png' })],
    [new File(['x'], 'a.gif', { type: 'image/gif' })], [new File(['x'], 'a.jpg', { type: 'image/png' })],
    [new File([new Uint8Array(10485761)], 'large.webp', { type: 'image/webp' })]]) {
    expect(validateUploadFiles(files)).toEqual(expect.any(String));
  }
});
