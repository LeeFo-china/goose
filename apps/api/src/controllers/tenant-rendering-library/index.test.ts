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

async function fixture() {
  const { TenantRenderingLibraryController } = await import('.');
  const { TenantRenderingLibraryService } = await import('@/services/tenant-rendering-library/service');
  const { accessPolicyService } = await import('@/services/access-policy');
  const store = makeRepositoryFixture();
  const service = new TenantRenderingLibraryService({ repository: store.repository, accessPolicy: accessPolicyService });
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
  new AuthenticatedController(service).registerExtraRoutes(app);
  await app.ready();
  return { app, registeredRoutes, ...store };
}

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

test('only six extra routes are exposed, with no publish or inherited CRUD', async () => {
  const { app, registeredRoutes } = await fixture();
  try {
    // Fastify adds a HEAD route for each GET, so the six handlers register eight method/path pairs.
    expect(registeredRoutes.toSorted()).toEqual([
      `GET ${base}`, `HEAD ${base}`, `POST ${base}`,
      `GET ${base}/:id`, `HEAD ${base}/:id`, `PATCH ${base}/:id`,
      `DELETE ${base}/:id`, `POST ${base}/:id/hide`,
    ].toSorted());
    for (const path of [`${base}/${styleId}/publish`, '/tenant_rendering_styles', '/tenant-rendering-library']) {
      expect((await app.inject({ method: 'POST', url: path, payload: {} })).statusCode).toBe(404);
    }
    const registry = await Bun.file(new URL('../../routes/index.ts', import.meta.url)).text();
    expect(registry).toContain('TenantRenderingLibraryController.registerExtraRoutes(app)');
    expect(registry).not.toMatch(/createResourceRoutes\([^\n]*TenantRenderingLibraryController/);
  } finally { await app.close(); }
});
