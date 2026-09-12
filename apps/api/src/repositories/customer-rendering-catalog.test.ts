import { expect, test } from 'bun:test';
import type { RenderingPublishedStyle } from '@gooes/domain';
import type { CustomerRenderingCatalogDatabaseClient } from './customer-rendering-catalog';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

const tenantId = '11111111-1111-4111-8111-111111111111';
const styleId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const publishedAt = '2026-09-13T08:00:00Z';
const publicUrl = 'https://images.example.test/public/renovation-styles/style.webp';
const row = {
  id: styleId,
  published_title: '奶油风客厅',
  published_space: 'living_room' as const,
  published_style: 'cream' as const,
  published_color_notes: '暖白色',
  published_material_notes: '木饰面',
  published_source_type: 'design' as const,
  published_at: publishedAt,
  published_file: { public_url: publicUrl },
};
const style: RenderingPublishedStyle = {
  id: styleId,
  title: row.published_title,
  space: row.published_space,
  style: row.published_style,
  color_notes: row.published_color_notes,
  material_notes: row.published_material_notes,
  source_type: row.published_source_type,
  image_url: publicUrl,
  published_at: publishedAt,
};

async function fixture(data: unknown, count: unknown = 1, error: unknown = null) {
  const { CustomerRenderingCatalogRepository } = await import('./customer-rendering-catalog');
  const calls: unknown[][] = [];
  const result = { data, count, error };
  const query = {
    select: (...args: unknown[]) => { calls.push(['select', ...args]); return query; },
    eq: (...args: unknown[]) => { calls.push(['eq', ...args]); return query; },
    is: (...args: unknown[]) => { calls.push(['is', ...args]); return query; },
    order: (...args: unknown[]) => { calls.push(['order', ...args]); return query; },
    range: (...args: unknown[]) => { calls.push(['range', ...args]); return query; },
    maybeSingle: async () => result,
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  const client = { from: (table: string) => { calls.push(['from', table]); return query; } } as unknown as CustomerRenderingCatalogDatabaseClient;
  return { repository: new CustomerRenderingCatalogRepository(client), calls, result };
}

test('list uses one explicit relation query, published snapshot filters and database pagination', async () => {
  const { repository, calls } = await fixture([row]);
  expect(await repository.list(tenantId, { page: 2, pageSize: 20, space: 'living_room', style: 'cream' }))
    .toEqual({ rows: [style], total: 1 });
  expect(calls.filter(([name]) => name === 'from')).toEqual([['from', 'tenant_rendering_styles']]);
  expect(calls).toContainEqual(['select',
    'id,published_title,published_space,published_style,published_color_notes,published_material_notes,published_source_type,published_at,published_file:platform_file_objects!tenant_rendering_styles_published_file_fkey(public_url)',
    { count: 'exact' }]);
  for (const call of [['eq', 'tenant_id', tenantId], ['eq', 'status', 'published'],
    ['is', 'deleted_at', null], ['eq', 'published_space', 'living_room'],
    ['eq', 'published_style', 'cream'], ['range', 20, 39]]) expect(calls).toContainEqual(call);
  expect(calls.filter(([name]) => name === 'order')).toEqual([
    ['order', 'sort_order', { ascending: true }], ['order', 'id', { ascending: true }],
  ]);
  expect(JSON.stringify(calls)).not.toContain('*');
});

test('list omits absent filters and defaults to first bounded page supplied by contract', async () => {
  const { repository, calls } = await fixture([], 0);
  expect(await repository.list(tenantId, { page: 1, pageSize: 20 })).toEqual({ rows: [], total: 0 });
  expect(calls).toContainEqual(['range', 0, 19]);
  expect(calls).not.toContainEqual(['eq', 'published_space', undefined]);
  expect(calls).not.toContainEqual(['eq', 'published_style', undefined]);
});

test('detail has same visibility and tenant filters and returns only public DTO', async () => {
  const { repository, calls, result } = await fixture(row);
  expect(await repository.find(tenantId, styleId)).toEqual(style);
  for (const call of [['eq', 'tenant_id', tenantId], ['eq', 'id', styleId],
    ['eq', 'status', 'published'], ['is', 'deleted_at', null]]) expect(calls).toContainEqual(call);
  expect(calls.filter(([name]) => name === 'from')).toEqual([['from', 'tenant_rendering_styles']]);
  result.data = null;
  expect(await repository.find(tenantId, styleId)).toBeNull();
});

test('rejects malformed snapshots, non-HTTPS URLs, array relations and unexpected private fields', async () => {
  const invalidRows = [
    { ...row, published_title: null },
    { ...row, published_at: null },
    { ...row, published_file: null },
    { ...row, published_file: [{ public_url: publicUrl }] },
    { ...row, published_file: { public_url: 'http://images.example.test/style.webp' } },
    { ...row, published_file: { public_url: null } },
    { ...row, tenant_id: otherId },
    { ...row, file_id: otherId },
  ];
  for (const badRow of invalidRows) {
    const list = await fixture([badRow]);
    await expect(list.repository.list(tenantId, { page: 1, pageSize: 20 }))
      .rejects.toMatchObject({ code: 'DB_ERROR' });
    const detail = await fixture(badRow);
    await expect(detail.repository.find(tenantId, styleId))
      .rejects.toMatchObject({ code: 'DB_ERROR' });
  }
});

test('rejects malformed envelopes, wrong detail id and raw database failures safely', async () => {
  for (const count of [null, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    const { repository } = await fixture([], count);
    await expect(repository.list(tenantId, { page: 1, pageSize: 20 }))
      .rejects.toMatchObject({ code: 'DB_ERROR' });
  }
  for (const data of [null, {}, [row, row]]) {
    const { repository } = await fixture(data);
    await expect(repository.list(tenantId, { page: 1, pageSize: 20 }))
      .rejects.toMatchObject({ code: 'DB_ERROR' });
  }
  const wrong = await fixture({ ...row, id: otherId });
  await expect(wrong.repository.find(tenantId, styleId)).rejects.toMatchObject({ code: 'DB_ERROR' });
  const failed = await fixture(null, null, { message: 'private SQL contents' });
  await expect(failed.repository.find(tenantId, styleId)).rejects.toMatchObject({
    code: 'DB_ERROR', message: '读取公开装修效果素材失败', details: undefined,
  });
});

test('wraps thrown database transport exceptions without exposing them', async () => {
  const { CustomerRenderingCatalogRepository } = await import('./customer-rendering-catalog');
  const client = { from: () => { throw { message: 'secret transport exception' }; } } as unknown as CustomerRenderingCatalogDatabaseClient;
  const repository = new CustomerRenderingCatalogRepository(client);
  await expect(repository.list(tenantId, { page: 1, pageSize: 20 })).rejects.toMatchObject({
    code: 'DB_ERROR', message: '读取公开装修效果素材失败', details: undefined,
  });
  await expect(repository.find(tenantId, styleId)).rejects.toMatchObject({
    code: 'DB_ERROR', message: '读取公开装修效果素材失败', details: undefined,
  });
});
