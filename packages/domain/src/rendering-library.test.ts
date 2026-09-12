import { describe, expect, test } from 'bun:test';
import * as domain from './index';
import * as shared from './shared';

const id = '11111111-1111-4111-8111-111111111111';
const create = {
  title: '  奶油客厅  ', space: 'living_room', style: 'cream',
  source_type: 'design', rights_confirmed: true, file_id: id,
} as const;

test('private file DTOs are strict, bounded and expose only upload metadata or HTTPS preview', () => {
  const upload = { file_id: id, mime_type: 'image/webp', size_bytes: 1024, width: 32, height: 24 } as const;
  expect(domain.RenderingLibraryFileUploadResultSchema?.parse(upload)).toEqual(upload);
  expect(shared.RenderingLibraryFileUploadResultSchema).toBe(domain.RenderingLibraryFileUploadResultSchema);
  for (const patch of [{ file_id: 'bad' }, { mime_type: 'image/png' }, { size_bytes: 0 },
    { size_bytes: domain.RENDERING_UPLOAD_MAX_BYTES + 1 }, { width: 0 }, { height: 1.5 },
    { object_key: 'private/secret' }, { tenant_id: id }, { url: 'https://example.com' }]) {
    expect(domain.RenderingLibraryFileUploadResultSchema?.safeParse({ ...upload, ...patch }).success).toBe(false);
  }
  const preview = { file_id: id, url: 'https://example.com/private?signature=test', expires_at: '2026-09-11T00:02:00Z' };
  expect(domain.RenderingLibraryFilePreviewResultSchema?.parse(preview)).toEqual(preview);
  expect(shared.RenderingLibraryFilePreviewResultSchema).toBe(domain.RenderingLibraryFilePreviewResultSchema);
  for (const patch of [{ file_id: 'bad' }, { url: 'http://example.com' }, { expires_at: '2026-09-11' },
    { expires_at: '2026-09-11T00:02:00' }, { bucket: 'private' }, { ttl: 120 }]) {
    expect(domain.RenderingLibraryFilePreviewResultSchema?.safeParse({ ...preview, ...patch }).success).toBe(false);
  }
});

describe('tenant rendering library draft contract', () => {
  test('exports the private source scene and publication states from both entry points', () => {
    expect(domain.RENDERING_LIBRARY_SOURCE_SCENE).toBe('rendering_style_source');
    expect(domain.RENDERING_LIBRARY_PUBLIC_SCENE).toBe('rendering_style_public');
    expect(domain.RENDERING_LIBRARY_STATUS_VALUES).toEqual(['draft', 'published', 'hidden']);
    expect(shared.RENDERING_LIBRARY_PUBLIC_SCENE).toBe(domain.RENDERING_LIBRARY_PUBLIC_SCENE);
    expect(shared.RENDERING_LIBRARY_STATUS_VALUES).toBe(domain.RENDERING_LIBRARY_STATUS_VALUES);
    expect(shared.RenderingLibraryCreateSchema).toBe(domain.RenderingLibraryCreateSchema);
  });

  test('defaults paging to 1/20 and bounds strict list filters', () => {
    expect(domain.RenderingLibraryListSchema?.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(domain.RenderingLibraryListSchema?.safeParse({ page: '2', pageSize: '100', status: 'hidden' }).success).toBe(true);
    for (const input of [{ pageSize: 101 }, { page: 0 }, { tenant_id: id }]) {
      expect(domain.RenderingLibraryListSchema?.safeParse(input).success).toBe(false);
    }
  });

  test('strictly validates publication commands and rejects unconfirmed or unknown input', () => {
    const input = { expected_version: 2, idempotency_key: id, responsibility_confirmed: true } as const;
    expect(domain.RenderingLibraryPublishSchema?.parse(input)).toEqual(input);
    expect(shared.RenderingLibraryPublishSchema).toBe(domain.RenderingLibraryPublishSchema);
    for (const patch of [
      { responsibility_confirmed: false },
      { unknown: true },
      { idempotency_key: 'not-a-uuid' },
      { expected_version: 0 },
    ]) {
      expect(domain.RenderingLibraryPublishSchema?.safeParse({ ...input, ...patch }).success).toBe(false);
    }
  });

  test('strictly validates the public published-style DTO without internal file identity', () => {
    const published = {
      id,
      title: '奶油客厅',
      space: 'living_room',
      style: 'cream',
      color_notes: '',
      material_notes: '',
      source_type: 'design',
      image_url: 'https://cdn.example.com/rendering-style.webp',
      published_at: '2026-09-11T10:00:00+08:00',
    } as const;
    expect(domain.RenderingPublishedStyleSchema?.parse(published)).toEqual(published);
    expect(shared.RenderingPublishedStyleSchema).toBe(domain.RenderingPublishedStyleSchema);
    for (const patch of [
      { image_url: 'http://cdn.example.com/rendering-style.webp' },
      { file_id: id },
      { tenant_id: id },
      { status: 'published' },
      { published_by_employee_id: id },
      { unknown: true },
      { published_at: '2026-09-11T10:00:00' },
    ]) {
      expect(domain.RenderingPublishedStyleSchema?.safeParse({ ...published, ...patch }).success).toBe(false);
    }
  });

  test('strictly validates published-style pagination and complete publication summaries', () => {
    const style = {
      id,
      title: '奶油客厅',
      space: 'living_room',
      style: 'cream',
      color_notes: '',
      material_notes: '',
      source_type: 'design',
      image_url: 'https://cdn.example.com/rendering-style.webp',
      published_at: '2026-09-11T10:00:00+08:00',
    } as const;
    const page = { list: [style], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } };
    expect(domain.RenderingPublishedStyleListSchema?.parse(page)).toEqual(page);
    expect(shared.RenderingPublishedStyleListSchema).toBe(domain.RenderingPublishedStyleListSchema);
    expect(domain.RenderingPublishedStyleListSchema?.safeParse({
      ...page, pagination: { ...page.pagination, pageSize: 101 },
    }).success).toBe(false);
    expect(domain.RenderingPublishedStyleListSchema?.safeParse({
      ...page, list: [{ ...style, published_at: undefined }],
    }).success).toBe(false);
    expect(domain.RenderingPublishedStyleListSchema?.safeParse({
      ...page, pagination: { ...page.pagination, total: 21, totalPages: 1 },
    }).success).toBe(false);
    expect(domain.RenderingPublishedStyleListSchema?.safeParse({
      ...page, pagination: { ...page.pagination, pageSize: 0 },
    }).success).toBe(false);
  });

  test('rejects a public page whose list exceeds pageSize', () => {
    const style = {
      id,
      title: '奶油客厅',
      space: 'living_room',
      style: 'cream',
      color_notes: '',
      material_notes: '',
      source_type: 'design',
      image_url: 'https://cdn.example.com/rendering-style.webp',
      published_at: '2026-09-11T10:00:00+08:00',
    } as const;
    expect(domain.RenderingPublishedStyleListSchema?.safeParse({
      list: [style, style],
      pagination: { page: 1, pageSize: 1, total: 2, totalPages: 2 },
    }).success).toBe(false);
  });

  test('rejects more than 100 styles in a public page', () => {
    const style = {
      id,
      title: '奶油客厅',
      space: 'living_room',
      style: 'cream',
      color_notes: '',
      material_notes: '',
      source_type: 'design',
      image_url: 'https://cdn.example.com/rendering-style.webp',
      published_at: '2026-09-11T10:00:00+08:00',
    } as const;
    expect(domain.RenderingPublishedStyleListSchema?.safeParse({
      list: Array.from({ length: 101 }, () => style),
      pagination: { page: 1, pageSize: 100, total: 101, totalPages: 2 },
    }).success).toBe(false);
  });

  test('rejects unknown keys nested in public pagination', () => {
    const style = {
      id,
      title: '奶油客厅',
      space: 'living_room',
      style: 'cream',
      color_notes: '',
      material_notes: '',
      source_type: 'design',
      image_url: 'https://cdn.example.com/rendering-style.webp',
      published_at: '2026-09-11T10:00:00+08:00',
    } as const;
    expect(domain.RenderingPublishedStyleListSchema?.safeParse({
      list: [style],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1, cursor: 'unexpected' },
    }).success).toBe(false);
  });

  test('accepts an empty public page when total and totalPages are zero', () => {
    const emptyPage = { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
    expect(domain.RenderingPublishedStyleListSchema?.parse(emptyPage)).toEqual(emptyPage);
  });

  test('creates with explicit rights and file identity and defaults only on creation', () => {
    expect(domain.RenderingLibraryCreateSchema?.parse(create)).toEqual({
      ...create, title: '奶油客厅', color_notes: '', material_notes: '', sort_order: 0,
    });
    for (const patch of [
      { title: ' ' }, { title: '字'.repeat(81) }, { color_notes: '字'.repeat(301) },
      { material_notes: '字'.repeat(301) }, { space: 'kitchen' }, { style: 'unknown' },
      { source_type: 'unknown' }, { file_id: 'bad' }, { rights_confirmed: false },
      { rights_confirmed: undefined }, { sort_order: -1 }, { sort_order: 100001 },
      { status: 'draft' }, { status: 'published' }, { tenant_id: id }, { approved: true },
    ]) {
      expect(domain.RenderingLibraryCreateSchema?.safeParse({ ...create, ...patch }).success).toBe(false);
    }
  });

  test('a title-only patch preserves omitted notes and sort order', () => {
    expect(domain.RenderingLibraryUpdateSchema?.parse({ title: '  新标题  ', expected_version: 1 }))
      .toEqual({ title: '新标题', expected_version: 1 });
    expect(domain.RenderingLibraryUpdateSchema?.parse({ color_notes: '', material_notes: '', sort_order: 0, expected_version: 1 }))
      .toEqual({ color_notes: '', material_notes: '', sort_order: 0, expected_version: 1 });
  });

  test('requires an actual editable field and rejects authority and attachment replacement in patches', () => {
    for (const input of [
      {}, { expected_version: 1 }, { expected_version: 1, title: undefined },
      { title: '更新' }, { title: ' ' , expected_version: 1 },
      ...[{ file_id: id }, { rights_confirmed: true }, { status: 'hidden' }, { status: 'published' },
        { tenant_id: id }, { approved: true }, { unknown: true }]
        .map((extra) => ({ title: '更新', expected_version: 1, ...extra })),
    ]) {
      expect(domain.RenderingLibraryUpdateSchema?.safeParse(input).success).toBe(false);
    }
  });

  test('bounds optimistic versions to leave room for an integer increment', () => {
    for (const expected_version of [1, 2147483646]) {
      expect(domain.RenderingLibraryVersionSchema?.safeParse({ expected_version }).success).toBe(true);
      expect(domain.RenderingLibraryUpdateSchema?.safeParse({ title: '更新', expected_version }).success).toBe(true);
    }
    for (const expected_version of [0, -1, 1.5, 2147483647, '1', Infinity]) {
      expect(domain.RenderingLibraryVersionSchema?.safeParse({ expected_version }).success).toBe(false);
      expect(domain.RenderingLibraryUpdateSchema?.safeParse({ title: '更新', expected_version }).success).toBe(false);
    }
    expect(domain.RenderingLibraryVersionSchema?.safeParse({ expected_version: 1, status: 'draft' }).success).toBe(false);
  });

  test('validates returned tenant rows, publication summaries, versions and timestamps', () => {
    const row = { ...create, id, tenant_id: id, status: 'draft', version: 2147483647,
      created_by_employee_id: null, published_version: null, published_at: null,
      published_by_employee_id: null, created_at: '2026-09-11T10:00:00+08:00', updated_at: '2026-09-11T02:00:00Z' };
    expect(domain.RenderingLibraryStyleSchema?.safeParse(row).success).toBe(true);
    expect(domain.RenderingLibraryStyleSchema?.safeParse({ ...row, status: 'published', created_by_employee_id: id,
      published_version: 2, published_at: '2026-09-11T10:00:00+08:00', published_by_employee_id: id }).success).toBe(true);
    for (const patch of [{ status: 'unknown' }, { version: 0 }, { version: 2147483648 },
      { id: 'bad' }, { tenant_id: 'bad' }, { created_by_employee_id: 'bad' },
      { published_version: 0 }, { published_version: 2147483648 }, { published_at: '2026-09-11' },
      { published_by_employee_id: 'bad' }, { published_file_id: id },
      { created_at: '2026-09-11' }, { updated_at: '2026-09-11T02:00:00' }]) {
      expect(domain.RenderingLibraryStyleSchema?.safeParse({ ...row, ...patch }).success).toBe(false);
    }
  });
});
