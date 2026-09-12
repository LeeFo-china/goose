import { expect, test } from 'bun:test';
import type { RenderingPublishedStyle } from '@gooes/domain';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

const tenantId = '11111111-1111-4111-8111-111111111111';
const styleId = '22222222-2222-4222-8222-222222222222';
const publicStyle: RenderingPublishedStyle = {
  id: styleId, title: '奶油风客厅', space: 'living_room', style: 'cream',
  color_notes: '暖白色', material_notes: '木饰面', source_type: 'design',
  image_url: 'https://images.example.test/style.webp', published_at: '2026-09-13T08:00:00Z',
};

async function fixture(options: { style?: RenderingPublishedStyle | null; total?: number } = {}) {
  const { CustomerRenderingCatalogService } = await import('./catalog');
  const calls: Array<{ operation: string; args: unknown[] }> = [];
  const actor = { tenantId, channel: 'wechat' as const, subject: 'private-subject',
    applicationId: null, installationId: null, verifiedPhone: null };
  const result = options.style === undefined ? publicStyle : options.style;
  const service = new CustomerRenderingCatalogService({
    contextService: {
      async resolveWechat(user) { calls.push({ operation: 'wechat', args: [user] }); return actor; },
      async resolveDouyin(user) { calls.push({ operation: 'douyin', args: [user] }); return { ...actor, channel: 'douyin' }; },
    },
    repository: {
      async list(scopedTenantId, input) {
        calls.push({ operation: 'list', args: [scopedTenantId, input] });
        return { rows: result ? [result] : [], total: options.total ?? (result ? 1 : 0) };
      },
      async find(scopedTenantId, id) {
        calls.push({ operation: 'find', args: [scopedTenantId, id] });
        return result;
      },
    },
  });
  return { service, calls };
}

test('WeChat list resolves trusted actor before querying and applies shared defaults', async () => {
  const { service, calls } = await fixture();
  const user = { token_type: 'visitor_session', tenant_id: 'malicious-tenant' } as never;
  expect(await service.listStyles(user, 'wechat', {})).toEqual({
    list: [publicStyle], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  });
  expect(calls).toEqual([
    { operation: 'wechat', args: [user] },
    { operation: 'list', args: [tenantId, { page: 1, pageSize: 20 }] },
  ]);
});

test('Douyin list uses only Douyin resolver and passes published filters and pagination', async () => {
  const { service, calls } = await fixture({ total: 41 });
  expect(await service.listStyles(undefined, 'douyin', {
    page: '2', pageSize: '20', space: 'living_room', style: 'cream',
  })).toEqual({
    list: [publicStyle], pagination: { page: 2, pageSize: 20, total: 41, totalPages: 3 },
  });
  expect(calls.map((call) => call.operation)).toEqual(['douyin', 'list']);
  expect(calls[1]?.args).toEqual([tenantId, {
    page: 2, pageSize: 20, space: 'living_room', style: 'cream',
  }]);
});

test('detail validates id, uses trusted tenant and returns only public fields', async () => {
  const { service, calls } = await fixture();
  const result = await service.getStyle(undefined, 'wechat', styleId);
  expect(result).toEqual(publicStyle);
  expect(JSON.stringify(result)).not.toMatch(/tenant|file_id|object|employee|version|private-subject/);
  expect(calls.map((call) => call.operation)).toEqual(['wechat', 'find']);
  expect(calls[1]?.args).toEqual([tenantId, styleId]);
});

test('hidden or nonexistent detail becomes stable 404', async () => {
  const { service } = await fixture({ style: null });
  await expect(service.getStyle(undefined, 'douyin', styleId)).rejects.toMatchObject({
    statusCode: 404, code: 'RENDERING_STYLE_NOT_FOUND',
  });
});

test('invalid query and id are rejected without repository access', async () => {
  const { service, calls } = await fixture();
  for (const query of [{ pageSize: 101 }, { page: 0 }, { space: 'unsupported' },
    { tenant_id: tenantId }, { style: 'unsupported' }]) {
    await expect(service.listStyles(undefined, 'wechat', query))
      .rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
  }
  await expect(service.getStyle(undefined, 'wechat', 'bad-id'))
    .rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
  expect(calls.every((call) => call.operation !== 'list' && call.operation !== 'find')).toBe(true);
});
