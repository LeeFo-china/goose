import 'reflect-metadata';
import { expect, test } from 'bun:test';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import errorHandler from '@/plugins/error-handler';
import { Errors } from '@/errors/error-factory';
import { makeFilesFixture } from '@/services/rendering-library-files/test-fixtures';
import { createInput, makeAuth, makeRepositoryFixture, otherTenantId, tenantId } from '@/services/tenant-rendering-library/test-fixtures';

const base = '/tenant/rendering-library/files';
const boundary = 'rendering-private-boundary';
const contentType = `multipart/form-data; boundary=${boundary}`;
function filePart(bytes: Buffer, field = 'file'): Buffer {
  return Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="source.png"\r\nContent-Type: image/png\r\n\r\n`), bytes, Buffer.from('\r\n')]);
}
function fieldPart(): Buffer {
  return Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="tenant_id"\r\n\r\n${otherTenantId}\r\n`);
}
function body(...parts: Buffer[]): Buffer {
  return Buffer.concat([...parts, Buffer.from(`--${boundary}--\r\n`)]);
}
async function fixture() {
  const store = await makeFilesFixture();
  const { TenantRenderingLibraryFilesController } = await import('./files');
  const { TenantRenderingLibraryController } = await import('.');
  async function identity(request: FastifyRequest) {
    if (request.headers['x-unauthenticated']) throw Errors.unauthorized();
    return { ...makeAuth({ permissions: request.headers['x-denied'] ? [] : makeAuth().permissions }),
      tenantId: request.headers['x-foreign'] ? otherTenantId : tenantId };
  }
  class FilesController extends TenantRenderingLibraryFilesController {
    protected override getRequiredTenantContext(request: FastifyRequest) { return identity(request); }
  }
  class DraftController extends TenantRenderingLibraryController {
    protected override getRequiredTenantContext(request: FastifyRequest) { return identity(request); }
  }
  const app = Fastify({ logger: false });
  await app.register(multipart);
  const routes: string[] = [];
  const routeAccess = new Map<string, unknown>();
  const reads = { parts: 0 };
  app.addHook('onRoute', ({ method, url, config }) => {
    if (url.startsWith(base)) for (const item of Array.isArray(method) ? method : [method]) {
      routes.push(`${item} ${url}`);
      routeAccess.set(`${item} ${url}`, config?.tenantServiceAccess);
    }
  });
  app.addHook('preHandler', async (request) => {
    const parts = request.parts.bind(request);
    request.parts = (options) => { reads.parts++; return parts(options); };
  });
  errorHandler(app);
  new FilesController(store.service).registerExtraRoutes(app);
  new DraftController(store.draftService).registerExtraRoutes(app);
  await app.ready();
  return { ...store, app, routes, reads, routeAccess };
}

test('multipart upload→signed preview→draft runs real controllers, services, normalizer, gateway and repository', async () => {
  const { app, bytes, files, uploaded } = await fixture();
  try {
    const response = await app.inject({ method: 'POST', url: base, headers: { 'content-type': contentType }, payload: body(filePart(bytes)) });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const result = response.json().data;
    expect(result).toEqual({ file_id: expect.any(String), mime_type: 'image/webp', size_bytes: uploaded[0]!.length, width: 32, height: 24 });
    expect(files.get(result.file_id)?.status).toBe('active');
    const before = Date.now();
    const preview = await app.inject({ method: 'GET', url: `${base}/${result.file_id}/preview` });
    expect(preview.statusCode).toBe(200);
    expect(preview.headers['cache-control']).toBe('private, no-store');
    expect(Object.keys(preview.json().data).sort()).toEqual(['expires_at', 'file_id', 'url']);
    expect(Date.parse(preview.json().data.expires_at)).toBeGreaterThanOrEqual(before + 118000);
    expect(Date.parse(preview.json().data.expires_at)).toBeLessThanOrEqual(Date.now() + 120000);
    expect(new URL(preview.json().data.url).searchParams.get('q-signature')).toBeTruthy();
    const signedExpiry = Number(new URL(preview.json().data.url).searchParams.get('q-sign-time')?.split(';')[1]) * 1000;
    expect(Date.parse(preview.json().data.expires_at)).toBeLessThanOrEqual(signedExpiry);
    const draft = await app.inject({ method: 'POST', url: '/tenant/rendering-library/styles', payload: { ...createInput, file_id: result.file_id } });
    expect(draft.statusCode).toBe(200);
    expect(draft.json().data).toMatchObject({ status: 'draft', file_id: result.file_id });
    expect((await app.inject({ method: 'GET', url: `${base}/${result.file_id}/preview`, headers: { 'x-foreign': '1' } })).statusCode).toBe(404);
  } finally { await app.close(); }
});

test('authentication and upload permission precede query validation and multipart reads', async () => {
  const { app, reads, events, bytes } = await fixture();
  try {
    for (const [header, status] of [['x-unauthenticated', 401], ['x-denied', 403]] as const) {
      const response = await app.inject({ method: 'POST', url: `${base}?tenant_id=bad`,
        headers: { [header]: '1', 'content-type': contentType }, payload: body(filePart(bytes)) });
      expect(response.statusCode).toBe(status);
      expect((await app.inject({ method: 'GET', url: `${base}/${createInput.file_id}/preview`, headers: { [header]: '1' } })).statusCode).toBe(status);
    }
    expect((await app.inject({ method: 'GET', url: `${base}/invalid/preview?ttl=1`, headers: { 'x-unauthenticated': '1' } })).statusCode).toBe(401);
    expect(reads.parts).toBe(0);
    expect(events).toEqual([]);
  } finally { await app.close(); }
});

test('strict multipart rejects empty, wrong field, extra files/fields, oversize and incomplete framing before storage', async () => {
  const { app, events, bytes, files } = await fixture();
  try {
    for (const payload of [body(), body(filePart(bytes, 'image')), body(filePart(bytes), filePart(bytes)),
      body(fieldPart(), filePart(bytes)), body(filePart(bytes), fieldPart()), body(filePart(Buffer.alloc(10 * 1024 * 1024 + 1))),
      filePart(bytes), Buffer.concat([filePart(bytes), Buffer.from(`--${boundary}\r\n`)])]) {
      const response = await app.inject({ method: 'POST', url: base, headers: { 'content-type': contentType }, payload });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
      expect(response.body).not.toContain('FST_');
      expect(response.body).not.toContain('ERR_STREAM');
    }
    expect(events).toEqual([]);
    expect(files.size).toBe(0);
  } finally { await app.close(); }
});

test('URL, TTL, tenant and other parameters are rejected and cannot bypass file service', async () => {
  const { app, events, bytes } = await fixture();
  try {
    for (const query of ['ttl=9999', 'url=https%3A%2F%2Fpublic.test', `tenant_id=${otherTenantId}`, 'unknown=1']) {
      expect((await app.inject({ method: 'POST', url: `${base}?${query}`, headers: { 'content-type': contentType }, payload: body(filePart(bytes)) })).statusCode).toBe(400);
      expect((await app.inject({ method: 'GET', url: `${base}/${createInput.file_id}/preview?${query}` })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: 'POST', url: base, payload: { file_id: createInput.file_id } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `${base}/invalid/preview` })).statusCode).toBe(400);
    expect(events).toEqual([]);
  } finally { await app.close(); }
});

test('SDK failure responses are sanitized and cannot activate staged rows', async () => {
  const { app, state, bytes, files } = await fixture();
  try {
    state.fail = 'put';
    const response = await app.inject({ method: 'POST', url: base, headers: { 'content-type': contentType }, payload: body(filePart(bytes)) });
    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('RENDERING_STORAGE_FAILED');
    expect(response.body).not.toContain('raw secret');
    const row = [...files.values()][0]!;
    expect(row.status).toBe('migrating');
    expect((await app.inject({ method: 'GET', url: `${base}/${row.id}/preview` })).statusCode).toBe(404);
  } finally { await app.close(); }
});

test('files controller registers upload + single/batch preview (+ HEAD), adjacent to unchanged draft routes', async () => {
  const { app, routes, routeAccess } = await fixture();
  try {
    expect(routes.sort()).toEqual([`POST ${base}`, `GET ${base}/:id/preview`, `HEAD ${base}/:id/preview`, `POST ${base}/previews`].sort());
    expect(routeAccess.get(`POST ${base}/previews`)).toBe('read');
    const registry = await Bun.file(new URL('../../routes/index.ts', import.meta.url)).text();
    expect(registry).toContain('TenantRenderingLibraryFilesController.registerExtraRoutes(app)');
    expect(registry).not.toMatch(/createResourceRoutes\([^\n]*TenantRenderingLibraryFilesController/);
    expect((await app.inject({ method: 'GET', url: base })).statusCode).toBe(404);
  } finally { await app.close(); }
});

test('HTTP batch preview preserves order and returns private no-store with one DB/config/COS pass', async () => {
  const { app, files, events, io } = await fixture();
  try {
    const source = makeRepositoryFixture().source;
    const ids = Array.from({ length: 20 }, () => crypto.randomUUID());
    for (const id of ids) files.set(id, { ...source, id, object_key: `private/renovation-styles/${tenantId}/${id}.webp` });
    const response = await app.inject({ method: 'POST', url: `${base}/previews`, payload: { file_ids: ids.toReversed() } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const items = response.json().data.items;
    expect(items.map((item: { file_id: string }) => item.file_id)).toEqual(ids.toReversed());
    expect(new Set(items.map((item: { expires_at: string }) => item.expires_at)).size).toBe(1);
    expect(io).toEqual({ database: 1, cos: 1 });
    expect(events).toEqual(['find-batch', 'config', ...Array(20).fill('preview')]);
    expect(Object.keys(items[0]).sort()).toEqual(['expires_at', 'file_id', 'url']);
    Object.assign(files.get(ids[0]!)!, { visibility: 'public' });
    events.length = 0;
    const denied = await app.inject({ method: 'POST', url: `${base}/previews`, payload: { file_ids: ids.toReversed() } });
    expect(denied.statusCode).toBe(404);
    expect(denied.json().code).toBe('RENDERING_STYLE_FILE_NOT_FOUND');
    expect(events).toEqual(['find-batch']);
  } finally { await app.close(); }
});

test('HTTP batch validates identity first and rejects authority fields, bounds and query fields before IO', async () => {
  const { app, events, io } = await fixture();
  try {
    const valid = { file_ids: [createInput.file_id] };
    expect((await app.inject({ method: 'POST', url: `${base}/previews`, headers: { 'x-unauthenticated': '1' }, payload: {} })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: `${base}/previews`, headers: { 'x-denied': '1' }, payload: valid })).statusCode).toBe(403);
    for (const payload of [{}, { file_ids: [] }, { file_ids: ['bad'] }, { file_ids: [createInput.file_id, createInput.file_id] },
      { file_ids: Array.from({ length: 101 }, () => crypto.randomUUID()) },
      { ...valid, tenant_id: otherTenantId }, { ...valid, ttl: 9999 }, { ...valid, url: 'https://public.example.com' }]) {
      expect((await app.inject({ method: 'POST', url: `${base}/previews`, payload })).statusCode).toBe(400);
    }
    for (const query of ['ttl=9999', `tenant_id=${otherTenantId}`, 'url=https%3A%2F%2Fpublic.example.com']) {
      expect((await app.inject({ method: 'POST', url: `${base}/previews?${query}`, payload: valid })).statusCode).toBe(400);
    }
    expect(events).toEqual([]);
    expect(io).toEqual({ database: 0, cos: 0 });
  } finally { await app.close(); }
});
