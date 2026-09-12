import 'reflect-metadata';
import { expect, test } from 'bun:test';
import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';
import errorHandler from '@/plugins/error-handler';
import { Errors } from '@/errors/error-factory';
import { createInput, makeAuth, makeRepositoryFixture, otherTenantId, styleId, tenantId } from '@/services/tenant-rendering-library/test-fixtures';
process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
const base = '/tenant/rendering-library/styles';
const publishKey = '77777777-7777-4777-8777-777777777777';
const publishBody = { expected_version: 1, idempotency_key: publishKey, responsibility_confirmed: true };

async function fixture() {
  const { TenantRenderingLibraryController } = await import('.');
  const { TenantRenderingLibraryService } = await import('@/services/tenant-rendering-library/service');
  const { TenantRenderingPublicationService } = await import('@/services/tenant-rendering-publication/service');
  const { accessPolicyService } = await import('@/services/access-policy');
  const store = makeRepositoryFixture();
  const service = new TenantRenderingLibraryService({ repository: store.repository, accessPolicy: accessPolicyService });
  const publicationEvents: string[] = [];
  let completed = false;
  const publication = new TenantRenderingPublicationService({ repository: {
    ...store.repository,
    async find(tenant, id) {
      const row = store.rows.get(id);
      if (!row || row.tenant_id !== tenant || row.deleted_at) return null;
      const { deleted_at: _deletedAt, ...style } = row;
      return style;
    },
  },
    publicationRepository: {
      async begin(input) {
        publicationEvents.push('begin');
        if (completed && input.idempotencyKey === publishKey) return {
          decision: 'succeeded', command_id: '55555555-5555-4555-8555-555555555555', result_version: 2,
        };
        if (store.rows.get(input.styleId)?.version !== input.expectedVersion) return { decision: 'version_conflict' };
        return { decision: 'claimed', command_id: '55555555-5555-4555-8555-555555555555',
          public_file_id: '66666666-6666-4666-8666-666666666666', source_file_id: store.source.id,
          source_location: { bucket: store.source.bucket, region: store.source.region, object_key: store.source.object_key },
          public_location: { bucket: store.source.bucket, region: store.source.region,
            object_key: `public/renovation-styles/${tenantId}/${styleId}/2.webp` },
          source_checksum: store.source.checksum ?? '', source_size_bytes: store.source.size_bytes, target_version: 2,
        };
      },
      async complete() {
        publicationEvents.push('complete');
        const row = store.rows.get(styleId);
        if (row) {
          row.status = 'published'; row.version = 2; row.published_version = 2;
          row.published_at = '2026-09-13T00:00:00Z'; row.published_by_employee_id = row.created_by_employee_id;
        }
        completed = true;
        return { decision: 'succeeded', command_id: '55555555-5555-4555-8555-555555555555', result_version: 2 };
      },
      async fail() { return { decision: 'failed' }; },
    },
    storage: {
      async hasPublicCopy() { publicationEvents.push('head'); return true; },
      async copyPublic() { publicationEvents.push('copy'); return { publicUrl: 'https://cdn.example.test/unexpected' }; },
      async resolvePublicUrl() { return `https://cdn.example.test/public/renovation-styles/${tenantId}/${styleId}/2.webp`; },
    },
    accessPolicy: accessPolicyService,
    uuid: () => '88888888-8888-4888-8888-888888888888',
  });
  class AuthenticatedController extends TenantRenderingLibraryController {
    protected override async getRequiredTenantContext(request: FastifyRequest) {
      if (request.headers['x-unauthenticated']) throw Errors.unauthorized();
      return { ...makeAuth({ permissions: request.headers['x-denied'] ? [] : makeAuth().permissions }),
        tenantId: request.headers['x-foreign'] ? otherTenantId : tenantId };
    }
  }
  const app = Fastify({ logger: false });
  const registeredRoutes: string[] = [];
  app.addHook('onRoute', ({ method, url }) => {
    for (const item of Array.isArray(method) ? method : [method]) {
      registeredRoutes.push(`${item} ${url}`);
    }
  });
  errorHandler(app);
  new AuthenticatedController(service, publication).registerExtraRoutes(app);
  await app.ready();
  return { app, registeredRoutes, publicationEvents, ...store };
}

test('HTTP publish returns the published summary and identical key replays without copying', async () => {
  const { app, publicationEvents } = await fixture();
  try {
    expect((await app.inject({ method: 'POST', url: base, payload: createInput })).statusCode).toBe(200);
    const first = await app.inject({ method: 'POST', url: `${base}/${styleId}/publish`, payload: publishBody });
    expect(publicationEvents).toEqual(['begin', 'head', 'complete']);
    expect(first.statusCode).toBe(200);
    expect(first.json().data).toMatchObject({ id: styleId, status: 'published', version: 2,
      published_version: 2, published_at: '2026-09-13T00:00:00Z' });
    expect(first.json().data).not.toHaveProperty('public_url');
    const replay = await app.inject({ method: 'POST', url: `${base}/${styleId}/publish`, payload: publishBody });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data).toEqual(first.json().data);
    expect(publicationEvents).toEqual(['begin', 'head', 'complete', 'begin']);
  } finally { await app.close(); }
});

test('HTTP publish rejects client authority, invalid query and stale version', async () => {
  const { app, publicationEvents } = await fixture();
  try {
    await app.inject({ method: 'POST', url: base, payload: createInput });
    for (const field of ['tenant_id', 'status', 'file_id', 'public_url']) {
      const response = await app.inject({ method: 'POST', url: `${base}/${styleId}/publish`,
        payload: { ...publishBody, [field]: 'untrusted' } });
      expect(response.statusCode).toBe(400);
    }
    expect((await app.inject({ method: 'POST', url: `${base}/${styleId}/publish?tenant_id=${otherTenantId}`,
      payload: publishBody })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `${base}/invalid/publish`, payload: publishBody })).statusCode).toBe(400);
    expect(publicationEvents).toEqual([]);
    const stale = await app.inject({ method: 'POST', url: `${base}/${styleId}/publish`,
      payload: { ...publishBody, expected_version: 2 } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('RENDERING_STYLE_VERSION_CONFLICT');
    expect(publicationEvents).toEqual(['begin']);
  } finally { await app.close(); }
});

test('HTTP private draft lifecycle, pagination, CAS conflicts and soft removal use real service', async () => {
  const { app, rows } = await fixture();
  try {
    const created = await app.inject({ method: 'POST', url: base, payload: createInput });
    expect(created.statusCode).toBe(200);
    expect(created.json().data).toMatchObject({ id: styleId, status: 'draft', version: 1 });
    expect(created.json().data).not.toHaveProperty('object_key');
    const found = await app.inject({ method: 'GET', url: `${base}/${styleId}` });
    expect(found.statusCode).toBe(200);
    expect(found.json().data).toEqual(created.json().data);
    const paged = await app.inject({ method: 'GET', url: `${base}?page=2&pageSize=1` });
    expect(paged.json().data).toEqual({ list: [], pagination: { page: 2, pageSize: 1, total: 1, totalPages: 1 } });
    const update = await app.inject({ method: 'PATCH', url: `${base}/${styleId}`, payload: { expected_version: 1, title: '新客厅' } });
    expect(update.statusCode).toBe(200);
    expect(update.json().data).toMatchObject({ title: '新客厅', version: 2, color_notes: '暖色', material_notes: '木质' });
    const stale = await app.inject({ method: 'PATCH', url: `${base}/${styleId}`, payload: { expected_version: 1, title: '旧提交' } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('RENDERING_STYLE_VERSION_CONFLICT');
    const hidden = await app.inject({ method: 'POST', url: `${base}/${styleId}/hide`, payload: { expected_version: 2 } });
    expect(hidden.statusCode).toBe(200);
    expect(hidden.json().data).toMatchObject({ status: 'hidden', version: 3 });
    const removed = await app.inject({ method: 'DELETE', url: `${base}/${styleId}`, payload: { expected_version: 3 } });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().data).toEqual({ id: styleId, deleted: true });
    expect(rows.get(styleId)?.deleted_at).toEqual(expect.any(String));
    expect((await app.inject({ method: 'GET', url: `${base}/${styleId}` })).statusCode).toBe(404);
  } finally { await app.close(); }
});

test('tenant authentication rejection precedes validation and never reaches persistence', async () => {
  const { app, calls } = await fixture();
  try {
    for (const request of [
      { method: 'GET' as const, url: `${base}?pageSize=101` },
      { method: 'GET' as const, url: `${base}/invalid` },
      { method: 'POST' as const, url: base, payload: {} },
      { method: 'PATCH' as const, url: `${base}/invalid`, payload: {} },
      { method: 'POST' as const, url: `${base}/invalid/hide`, payload: {} },
      { method: 'POST' as const, url: `${base}/invalid/publish?tenant_id=${otherTenantId}`, payload: {} },
      { method: 'DELETE' as const, url: `${base}/invalid`, payload: {} },
    ]) {
      expect((await app.inject({ ...request, headers: { 'x-unauthenticated': '1' } })).statusCode).toBe(401);
    }
    expect(calls).toEqual([]);
  } finally { await app.close(); }
});

test('HTTP boundaries reject foreign access, missing permission and unknown parameters on all routes', async () => {
  const { app } = await fixture();
  try {
    await app.inject({ method: 'POST', url: base, payload: createInput });
    expect((await app.inject({ method: 'GET', url: `${base}/${styleId}`, headers: { 'x-foreign': '1' } })).statusCode).toBe(404);
    const requests = [
      { method: 'GET' as const, url: base },
      { method: 'GET' as const, url: `${base}/${styleId}` },
      { method: 'POST' as const, url: base, payload: createInput },
      { method: 'PATCH' as const, url: `${base}/${styleId}`, payload: { expected_version: 1, title: '新' } },
      { method: 'POST' as const, url: `${base}/${styleId}/hide`, payload: { expected_version: 1 } },
      { method: 'POST' as const, url: `${base}/${styleId}/publish`, payload: publishBody },
      { method: 'DELETE' as const, url: `${base}/${styleId}`, payload: { expected_version: 1 } },
    ];
    for (const request of requests) {
      expect((await app.inject({ ...request, headers: { 'x-denied': '1' } })).statusCode).toBe(403);
      expect((await app.inject({ ...request, url: `${request.url}?tenant_id=${otherTenantId}` })).statusCode).toBe(400);
      if (request.payload) {
        expect((await app.inject({ ...request, payload: { ...request.payload, status: 'published' } })).statusCode).toBe(400);
      }
    }
    expect((await app.inject({ method: 'GET', url: `${base}?pageSize=101` })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `${base}/invalid` })).statusCode).toBe(400);
  } finally { await app.close(); }
});

test('only seven extra routes are exposed, with no inherited CRUD', async () => {
  const { app, registeredRoutes } = await fixture();
  try {
    // Fastify adds a HEAD route for each GET, so the seven handlers register nine method/path pairs.
    expect(registeredRoutes.toSorted()).toEqual([
      `GET ${base}`, `HEAD ${base}`, `POST ${base}`,
      `GET ${base}/:id`, `HEAD ${base}/:id`, `PATCH ${base}/:id`,
      `DELETE ${base}/:id`, `POST ${base}/:id/hide`, `POST ${base}/:id/publish`,
    ].toSorted());
    for (const path of ['/tenant_rendering_styles', '/tenant-rendering-library']) {
      expect((await app.inject({ method: 'POST', url: path, payload: {} })).statusCode).toBe(404);
    }
    const registry = await Bun.file(new URL('../../routes/index.ts', import.meta.url)).text();
    expect(registry).toContain('TenantRenderingLibraryController.registerExtraRoutes(app)');
    expect(registry).not.toMatch(/createResourceRoutes\([^\n]*TenantRenderingLibraryController/);
  } finally { await app.close(); }
});
