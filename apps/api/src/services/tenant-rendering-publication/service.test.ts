import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import { RenderingLibraryStyleSchema, type RenderingLibraryStyle } from '@gooes/domain';
import { Errors } from '@/errors/error-factory';
import { RenderingLibraryStorage } from '@/gateways/rendering-library-storage/client';
import type { BeginDecision, CompleteDecision, FailDecision, TenantRenderingPublicationDatabaseClient, TenantRenderingPublicationRepository } from '@/repositories/tenant-rendering-publication';
import type { RenderingLibrarySourceFile, TenantRenderingLibraryRepository } from '@/repositories/tenant-rendering-library';
import { createInput, fileId, makeAuth, otherTenantId, styleId, tenantId } from '@/services/tenant-rendering-library/test-fixtures';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
const commandId = '55555555-5555-4555-8555-555555555555';
const publicFileId = '66666666-6666-4666-8666-666666666666';
const key = '77777777-7777-4777-8777-777777777777';
const leaseToken = '88888888-8888-4888-8888-888888888888';
const nextLease = '99999999-9999-4999-8999-999999999999';
const body = { expected_version: 1, idempotency_key: key, responsibility_confirmed: true };
const config = { bucket: 'rendering-123456', region: 'ap-guangzhou', secretId: 'dummy', secretKey: 'dummy', publicBaseUrl: 'https://cdn.example.test/' };
const bytes = Buffer.from('normalized webp');
const checksum = createHash('sha256').update(bytes).digest('hex');
const location = { bucket: config.bucket, region: config.region, object_key: `private/renovation-styles/${tenantId}/${fileId}.webp` };
const publicLocation = { ...location, object_key: `public/renovation-styles/${tenantId}/${styleId}/2.webp` };
const publicUrl = `${config.publicBaseUrl}${publicLocation.object_key}`;
const summary = { published_version: 2, published_at: '2026-09-13T00:00:00Z', published_by_employee_id: fileId };
const claimed: Extract<BeginDecision, { decision: 'claimed' }> = { decision: 'claimed', command_id: commandId,
  public_file_id: publicFileId, source_file_id: fileId, source_location: location, public_location: publicLocation,
  source_checksum: checksum, source_size_bytes: bytes.length, target_version: 2 };
const succeeded = { decision: 'succeeded' as const, command_id: commandId, result_version: 2 };

async function fixture() {
  const { TenantRenderingPublicationService } = await import('./service');
  const { accessPolicyService } = await import('@/services/access-policy');
  const current: RenderingLibraryStyle = { ...createInput, id: styleId, tenant_id: tenantId, status: 'draft', version: 1,
    created_by_employee_id: fileId, published_version: null, published_at: null, published_by_employee_id: null,
    created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z' };
  const source: RenderingLibrarySourceFile = { id: fileId, tenant_id: tenantId, scene: 'rendering_style_source',
    status: 'active', visibility: 'private', deleted_at: null, mime_type: 'image/webp', size_bytes: bytes.length,
    ...location, provider: 'tencent_cos', owner_type: 'tenant', owner_id: tenantId, width: 32, height: 24,
    checksum, public_url: null, legacy_url: null, legacy_path: null };
  const events: string[] = [];
  const calls: unknown[][] = [];
  const state = { current, source, missing: false, sourceMissing: false, begin: structuredClone(claimed) as BeginDecision,
    complete: { ...succeeded } as CompleteDecision, failed: { decision: 'failed' } as FailDecision,
    errorAt: '', sourceError: null as unknown, publicExists: false, commandStatus: 'preparing', lease: leaseToken,
    latestPatch: {} as Partial<RenderingLibraryStyle>, latestMissing: false, findCount: 0, configReads: 0, failConfigAt: 0 };
  const repository: Pick<TenantRenderingLibraryRepository, 'find' | 'findSourceFile'> = {
    async find(tenant, id) {
      calls.push(['find', tenant, id]); events.push('find'); state.findCount++;
      return state.missing || (state.latestMissing && state.findCount > 1) || tenant !== current.tenant_id || id !== current.id ? null : { ...current };
    },
    async findSourceFile(tenant, id) {
      calls.push(['source', tenant, id]); events.push('source');
      if (state.sourceError) throw state.sourceError;
      return state.sourceMissing ? null : { ...source };
    },
  };
  const publicationRepository: Pick<TenantRenderingPublicationRepository, 'begin' | 'complete' | 'fail'> = {
    async begin(input) {
      calls.push(['begin', input]); events.push('begin');
      if (state.errorAt === 'begin') throw Errors.dbError('创建装修效果素材发布命令失败');
      return state.begin;
    },
    async complete(input) {
      calls.push(['complete', input]); events.push('complete');
      if (state.errorAt === 'complete') throw Errors.dbError('完成装修效果素材发布失败');
      if (state.complete.decision === 'succeeded') {
        Object.assign(current, summary, { status: 'published', version: 2 }, state.latestPatch);
        state.commandStatus = 'succeeded';
      }
      return state.complete;
    },
    async fail(input) {
      calls.push(['fail', input]); events.push('fail');
      if (state.errorAt === 'fail') throw Errors.dbError('记录装修效果素材发布失败');
      state.commandStatus = 'failed';
      return state.failed;
    },
  };
  // Exercise the real gateway; only persistence and COS are external replacements.
  const gateway = new RenderingLibraryStorage({ loadConfig: async () => {
    events.push('config');
    state.configReads++;
    if (state.errorAt === 'config' || state.configReads === state.failConfigAt) throw Errors.badRequest('raw config secret');
    return config;
  }, createCos: () => ({
    async headObject(params) {
      events.push('HEAD'); calls.push(['HEAD', params]);
      if (state.errorAt === 'HEAD') throw Errors.badRequest('raw head secret');
      if (!state.publicExists) throw { statusCode: 404 };
      return { ETag: 'test', headers: { 'content-type': 'image/webp', 'content-length': String(bytes.length), 'x-cos-meta-source-sha256': checksum } };
    },
    async getObject(params) {
      events.push('GET'); calls.push(['GET', params]);
      if (state.errorAt === 'GET' || state.errorAt === 'fail') throw Errors.badRequest('raw get secret');
      if (params.Output instanceof Writable) params.Output.end(bytes);
      return { Body: bytes, ETag: 'test' };
    },
    async putObject(params) {
      events.push('PUT'); calls.push(['PUT', params]);
      state.publicExists = true;
      if (state.errorAt === 'PUT') throw Errors.badRequest('raw lost PUT response secret');
    },
    getObjectUrl() { throw Errors.badRequest('unexpected signer'); },
  }) });
  const storage = {
    hasPublicCopy: gateway.hasPublicCopy.bind(gateway),
    copyPublic: gateway.copyPublic.bind(gateway),
    async resolvePublicUrl(input: Parameters<RenderingLibraryStorage['resolvePublicUrl']>[0]) {
      events.push('resolve'); return gateway.resolvePublicUrl(input);
    },
  };
  const service = new TenantRenderingPublicationService({ repository, publicationRepository, storage,
    accessPolicy: accessPolicyService, uuid: () => { events.push('uuid'); return state.lease; } });
  return { service, state, source, current, events, calls, publicationRepository };
}

test('publish requires tenant employee, read all and manage all before validation or any IO', async () => {
  const { service, calls, events } = await fixture();
  const denied = [makeAuth({ tenantId: null }), makeAuth({ employeeId: null }), makeAuth({ permissions: [] }),
    makeAuth({ isPlatformAdmin: true, permissions: [{ code: 'platform.picture.manage', scope: 'all' }] })];
  for (const permission of ['rendering_library.read', 'rendering_library.manage']) {
    for (const scope of [null, 'self', 'department', 'assigned'] as const) {
      denied.push(makeAuth({ permissions: makeAuth().permissions.filter((entry) => entry.code !== permission)
        .concat(scope ? [{ code: permission, scope }] : []) }));
    }
  }
  for (const auth of denied) await expect(service.publish(auth, 'invalid', {})).rejects.toMatchObject({ statusCode: 403 });
  expect(calls).toEqual([]); expect(events).toEqual([]);
});

test('publish strictly rejects invalid IDs, versions, responsibility and client authority', async () => {
  const { service, calls, events } = await fixture();
  await expect(service.publish(makeAuth(), 'invalid', body)).rejects.toMatchObject({ statusCode: 400 });
  for (const patch of [{ expected_version: 0 }, { expected_version: 2147483647 }, { expected_version: '1' },
    { responsibility_confirmed: false }, { responsibility_confirmed: undefined }, { idempotency_key: 'bad' },
    { tenant_id: otherTenantId }, { employee_id: otherTenantId }, { file_id: fileId }, { status: 'published' },
    { public_url: publicUrl }, { url: publicUrl }, { query: { tenant_id: otherTenantId } }, { lease_token: leaseToken }]) {
    await expect(service.publish(makeAuth(), styleId, { ...body, ...patch })).rejects.toMatchObject({ statusCode: 400 });
  }
  expect(calls).toEqual([]); expect(events).toEqual([]);
});

test('missing or foreign style and stale version stop before source or COS', async () => {
  const missing = await fixture(); missing.state.missing = true;
  await expect(missing.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({ statusCode: 404, code: 'RENDERING_STYLE_NOT_FOUND' });
  await expect(missing.service.publish(makeAuth({ tenantId: otherTenantId }), styleId, body)).rejects.toMatchObject({ statusCode: 404 });
  expect(missing.events).toEqual(['find', 'find']);
  const stale = await fixture(); stale.current.version = 3; stale.state.begin = { decision: 'version_conflict' };
  await expect(stale.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({ statusCode: 409, code: 'RENDERING_STYLE_VERSION_CONFLICT' });
  expect(stale.events).toEqual(['find', 'uuid', 'begin']);
});

test('current source eligibility and publication-only checksum validation precede begin', async () => {
  for (const patch of [{ tenant_id: otherTenantId }, { id: styleId }, { status: 'migrating' }, { visibility: 'public' },
    { scene: 'other' }, { deleted_at: '2026-09-11T00:00:00Z' }, { object_key: 'private/other' }, { provider: 'supabase' },
    { owner_type: 'employee' }, { owner_id: null }, { width: 0 }, { height: null }, { size_bytes: 10485761 },
    { size_bytes: 0 }, { mime_type: 'image/jpeg' }, { public_url: publicUrl }, { legacy_url: publicUrl }]) {
    const { service, source, events } = await fixture(); Object.assign(source, patch);
    await expect(service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({ statusCode: 422, code: 'RENDERING_STYLE_NOT_PUBLISHABLE', details: undefined });
    expect(events).toEqual(['find', 'source']);
  }
  for (const checksum of [null, '', 'A'.repeat(64), 'a'.repeat(63)]) {
    const f = await fixture(); f.source.checksum = checksum;
    await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({ statusCode: 422, code: 'RENDERING_STYLE_NOT_PUBLISHABLE' });
    expect(f.events).toEqual(['find', 'source']);
  }
  const f = await fixture(); f.state.sourceMissing = true;
  await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({ statusCode: 422, code: 'RENDERING_STYLE_NOT_PUBLISHABLE', details: undefined });
});

for (const scenario of ['missing', 'inactive', 'foreign tenant'] as const) {
  test(`publication rejects ${scenario} source with 422 before begin or COS`, async () => {
    const f = await fixture();
    if (scenario === 'missing') f.state.sourceMissing = true;
    if (scenario === 'inactive') f.source.status = 'migrating';
    if (scenario === 'foreign tenant') f.source.tenant_id = otherTenantId;
    await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({
      statusCode: 422, code: 'RENDERING_STYLE_NOT_PUBLISHABLE', message: '装修效果素材不满足发布条件', details: undefined,
    });
    expect(f.events).toEqual(['find', 'source']);
    expect(f.calls).toEqual([['find', tenantId, styleId], ['source', tenantId, fileId]]);
  });
}

test('source lookup DB and transport errors retain their original semantics without begin or COS', async () => {
  for (const error of [Errors.dbError('读取装修效果素材文件失败'), Errors.dbError('装修效果素材文件数据格式异常'),
    Errors.business(503, '读取服务暂不可用', 'SOURCE_TRANSPORT_UNAVAILABLE'),
    Errors.business(404, '其他依赖不存在', 'OTHER_DEPENDENCY_NOT_FOUND'), { code: 'ECONNRESET' }]) {
    const f = await fixture(); f.state.sourceError = error;
    await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toBe(error);
    expect(f.events).toEqual(['find', 'source']);
  }
});

test('claimed publication HEADs, copies once, completes trusted fields and returns strict latest summary', async () => {
  const { service, calls, events } = await fixture();
  const result = await service.publish(makeAuth(), styleId, body);
  expect(result).toMatchObject({ ...summary, status: 'published', version: 2 });
  expect(RenderingLibraryStyleSchema.safeParse(result).success).toBe(true);
  expect(calls).toContainEqual(['begin', { tenantId, styleId, expectedVersion: 1, idempotencyKey: key, leaseToken,
    requestHash: createHash('sha256').update(JSON.stringify(['tenant-rendering-style-publish-v1', tenantId, styleId, 1])).digest('hex') }]);
  expect(calls).toContainEqual(['complete', { tenantId, commandId, leaseToken, publicUrl, employeeId: fileId }]);
  expect(events).toEqual(['find', 'source', 'uuid', 'begin', 'config', 'HEAD', 'config', 'GET', 'PUT', 'complete', 'find']);
  expect(JSON.stringify(result)).not.toMatch(/object_key|public_file_id|public_url|command_id|checksum|bucket|region/);
});

test('existing public copy recovers through HEAD and URL resolution without GET or PUT', async () => {
  const f = await fixture(); f.state.publicExists = true;
  expect(await f.service.publish(makeAuth(), styleId, body)).toMatchObject(summary);
  expect(f.events).toEqual(['find', 'source', 'uuid', 'begin', 'config', 'HEAD', 'resolve', 'config', 'complete', 'find']);
});

test('complete result 2 accepts a concurrent republication to version 3 before final find', async () => {
  const f = await fixture();
  f.state.latestPatch = { version: 3, published_version: 3, published_at: '2026-09-13T00:00:01Z' };
  expect(f.state.complete).toEqual(succeeded);
  expect(await f.service.publish(makeAuth(), styleId, body)).toMatchObject({
    status: 'published', version: 3, published_version: 3, published_at: '2026-09-13T00:00:01Z',
  });
  expect(f.events.slice(-2)).toEqual(['complete', 'find']);
  expect(f.events).not.toContain('fail');
});

test('succeeded replay accepts advanced editable and publication versions without source or storage', async () => {
  const f = await fixture();
  await f.service.publish(makeAuth(), styleId, body);
  f.state.begin = succeeded;
  f.events.length = 0; f.calls.length = 0;
  expect(await f.service.publish(makeAuth(), styleId, body)).toMatchObject({ ...summary, version: 2 });
  expect(f.events).toEqual(['find', 'uuid', 'begin', 'find']);
  Object.assign(f.current, { status: 'hidden', version: 5, published_version: 4, published_by_employee_id: null });
  f.events.length = 0;
  expect(await f.service.publish(makeAuth(), styleId, body)).toMatchObject({ status: 'hidden', version: 5, published_version: 4 });
  expect(f.events).toEqual(['find', 'uuid', 'begin', 'find']);
});

test('begin normal decisions map stably, unexpected generated decisions become DB errors', async () => {
  for (const [decision, statusCode, code] of [
    ['not_found', 404, 'RENDERING_STYLE_NOT_FOUND'], ['version_conflict', 409, 'RENDERING_STYLE_VERSION_CONFLICT'],
    ['idempotency_conflict', 409, 'RENDERING_STYLE_PUBLISH_IDEMPOTENCY_CONFLICT'],
    ['in_progress', 409, 'RENDERING_STYLE_PUBLISH_IN_PROGRESS'], ['not_publishable', 422, 'RENDERING_STYLE_NOT_PUBLISHABLE'],
    ['invalid_request', 500, 'DB_ERROR'], ['lease_conflict', 500, 'DB_ERROR'],
  ] as const) {
    const f = await fixture(); f.state.begin = { decision };
    await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({ statusCode, code, details: undefined });
    expect(f.events).toEqual(['find', 'source', 'uuid', 'begin']);
  }
});

test('claimed mismatches and stale claims are rejected before COS or fail', async () => {
  for (const patch of [{ source_file_id: styleId }, { source_checksum: 'a'.repeat(64) }, { source_size_bytes: bytes.length + 1 },
    { target_version: 3 }, { public_file_id: fileId }, { source_location: { ...location, bucket: 'other-123456' } },
    { source_location: { ...location, region: 'ap-singapore' } }, { source_location: { ...location, object_key: 'private/other' } }]) {
    const f = await fixture(); f.state.begin = { ...claimed, ...patch };
    await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({ code: 'DB_ERROR', details: undefined });
    expect(f.events).toEqual(['find', 'source', 'uuid', 'begin']);
  }
  const f = await fixture(); f.current.version = 2;
  await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({ code: 'DB_ERROR' });
  expect(f.events).toEqual(['find', 'uuid', 'begin']);
});

test('definite config, path and source failures record exactly one allowlisted failure', async () => {
  for (const [errorAt, failureCode] of [['config', 'storage_unavailable'], ['GET', 'copy_failed']] as const) {
    const f = await fixture(); f.state.errorAt = errorAt;
    await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({
      statusCode: errorAt === 'config' ? 503 : 502,
      code: errorAt === 'config' ? 'RENDERING_STORAGE_UNAVAILABLE' : 'RENDERING_STYLE_PUBLIC_COPY_FAILED', details: undefined });
    expect(f.calls.filter(([name]) => name === 'fail')).toEqual([['fail', { tenantId, commandId, leaseToken, failureCode }]]);
    expect(f.events).not.toContain('complete'); expect(f.events).not.toContain('PUT');
  }
  const f = await fixture(); f.state.begin = { ...claimed, public_location: { ...publicLocation, object_key: 'public/other' } };
  await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({ statusCode: 503, code: 'RENDERING_STORAGE_UNAVAILABLE' });
  expect(f.calls).toContainEqual(['fail', { tenantId, commandId, leaseToken, failureCode: 'storage_unavailable' }]);
  expect(f.events).not.toContain('HEAD');
});

for (const phase of ['head', 'copy', 'resolve'] as const) {
  test(`known storage unavailability preserves sanitized 503 during ${phase}`, async () => {
    const f = await fixture();
    f.state.failConfigAt = phase === 'head' ? 1 : 2;
    f.state.publicExists = phase === 'resolve';
    await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({
      statusCode: 503, code: 'RENDERING_STORAGE_UNAVAILABLE', message: '装修效果素材存储暂不可用', details: undefined,
    });
    expect(f.calls.filter(([name]) => name === 'fail')).toEqual(phase === 'resolve' ? []
      : [['fail', { tenantId, commandId, leaseToken, failureCode: 'storage_unavailable' }]]);
    expect(f.state.commandStatus).toBe(phase === 'resolve' ? 'preparing' : 'failed');
    expect(f.events).not.toContain('GET'); expect(f.events).not.toContain('PUT'); expect(f.events).not.toContain('complete');
    expect(f.events.filter((event) => event === 'HEAD')).toHaveLength(phase === 'head' ? 0 : 1);
    expect(f.events.includes('resolve')).toBe(phase === 'resolve');
  });
}

test('storage-unavailable failure-recording errors still propagate the fixed DB error', async () => {
  const f = await fixture(); f.state.failConfigAt = 1; f.state.errorAt = 'fail';
  await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({
    code: 'DB_ERROR', message: '记录装修效果素材发布失败', details: undefined,
  });
  expect(f.events.filter((event) => event === 'fail')).toHaveLength(1);
});

test('HEAD, PUT and complete unknown results never fail, retry or claim success', async () => {
  for (const errorAt of ['HEAD', 'PUT', 'complete', 'begin']) {
    const f = await fixture(); f.state.errorAt = errorAt;
    await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({
      code: errorAt === 'complete' || errorAt === 'begin' ? 'DB_ERROR' : 'RENDERING_STYLE_PUBLIC_COPY_FAILED', details: undefined });
    expect(f.events).not.toContain('fail');
    expect(f.events.filter((event) => event === 'PUT')).toHaveLength(['PUT', 'complete'].includes(errorAt) ? 1 : 0);
    expect(f.state.commandStatus).toBe('preparing');
  }
});

test('lost PUT response keeps preparing; next lease recovers with HEAD true and zero additional PUT', async () => {
  const f = await fixture(); f.state.errorAt = 'PUT';
  await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({ code: 'RENDERING_STYLE_PUBLIC_COPY_FAILED' });
  expect(f.state.commandStatus).toBe('preparing'); expect(f.state.publicExists).toBe(true);
  f.state.errorAt = ''; f.state.lease = nextLease; f.events.length = 0;
  expect(await f.service.publish(makeAuth(), styleId, body)).toMatchObject(summary);
  expect(f.events).toEqual(['find', 'source', 'uuid', 'begin', 'config', 'HEAD', 'resolve', 'config', 'complete', 'find']);
  expect(f.calls.filter(([name]) => name === 'PUT')).toHaveLength(1);
  expect(f.calls).toContainEqual(['complete', { tenantId, commandId, leaseToken: nextLease, publicUrl, employeeId: fileId }]);
  expect(f.calls.some(([name]) => name === 'fail')).toBe(false);
});

test('committed complete with a lost transport response replays the same key without another copy', async () => {
  const f = await fixture();
  const { TenantRenderingPublicationRepository } = await import('@/repositories/tenant-rendering-publication');
  const commit = f.publicationRepository.complete;
  const completeInput = { tenantId, commandId, leaseToken, publicUrl, employeeId: fileId };
  const rpcCalls: unknown[][] = [];
  // Preserve the real repository's error boundary while the transport commits before its response is lost.
  const client = { async rpc(name: string, params: unknown) {
    rpcCalls.push([name, params]);
    f.state.begin = await commit(completeInput);
    throw Errors.badRequest('raw SQL credential transport rejection after commit');
  } } as unknown as TenantRenderingPublicationDatabaseClient;
  const repository = new TenantRenderingPublicationRepository(client);
  f.publicationRepository.complete = repository.complete.bind(repository);
  await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({
    code: 'DB_ERROR', message: '完成装修效果素材发布失败', details: undefined,
  });
  expect(f.state.commandStatus).toBe('succeeded');
  expect(f.current).toMatchObject({ ...summary, version: 2, status: 'published' });
  expect(rpcCalls).toEqual([['complete_tenant_rendering_style_publish', {
    p_tenant_id: tenantId, p_command_id: commandId, p_lease_token: leaseToken, p_public_url: publicUrl, p_employee_id: fileId,
  }]]);
  f.events.length = 0; f.state.lease = nextLease;
  expect(await f.service.publish(makeAuth(), styleId, body)).toMatchObject({ ...summary, version: 2 });
  expect(f.events).toEqual(['find', 'uuid', 'begin', 'find']);
  expect(f.calls.filter(([name]) => name === 'PUT')).toHaveLength(1);
  expect(f.calls.filter(([name]) => name === 'complete')).toHaveLength(1);
  expect(f.calls.some(([name]) => name === 'fail')).toBe(false);
  expect(rpcCalls).toHaveLength(1);
});

test('failure-recording RPC errors propagate fixed DB error', async () => {
  const f = await fixture(); f.state.errorAt = 'fail';
  await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({ code: 'DB_ERROR', message: '记录装修效果素材发布失败', details: undefined });
  expect(f.events.filter((event) => event === 'fail')).toHaveLength(1);
});

test('fail decisions are mapped without retries or invented success', async () => {
  for (const [decision, code] of [['not_found', 'RENDERING_STYLE_NOT_FOUND'],
    ['lease_conflict', 'RENDERING_STYLE_PUBLISH_IN_PROGRESS'], ['invalid_request', 'DB_ERROR']] as const) {
    const f = await fixture(); f.state.errorAt = 'GET'; f.state.failed = { decision };
    await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({ code, details: undefined });
    expect(f.events.filter((event) => event === 'fail')).toHaveLength(1);
    expect(f.events).not.toContain('complete');
  }
  const f = await fixture(); f.state.errorAt = 'GET'; f.state.failed = succeeded;
  await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({ code: 'RENDERING_STYLE_PUBLIC_COPY_FAILED' });
  expect(f.events).not.toContain('complete');
});

test('complete decisions, mismatched results and invalid latest state never fabricate success', async () => {
  for (const [decision, code] of [['not_found', 'RENDERING_STYLE_NOT_FOUND'], ['version_conflict', 'RENDERING_STYLE_VERSION_CONFLICT'],
    ['lease_conflict', 'RENDERING_STYLE_PUBLISH_IN_PROGRESS'], ['not_publishable', 'RENDERING_STYLE_NOT_PUBLISHABLE']] as const) {
    const f = await fixture(); f.state.complete = { decision };
    await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({ code });
    expect(f.events).not.toContain('fail');
  }
  for (const result of [{ ...succeeded, command_id: fileId }, { ...succeeded, result_version: 3 }]) {
    const f = await fixture(); f.state.complete = result;
    await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({ code: 'DB_ERROR' });
  }
  for (const latestPatch of [{ published_version: null }, { published_version: 3 }, { published_at: null },
    { version: 1 }, { status: 'draft' as const }, { published_by_employee_id: 'bad' }]) {
    const f = await fixture(); f.state.latestPatch = latestPatch;
    await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({ code: 'DB_ERROR' });
    expect(f.events).not.toContain('fail');
  }
  const f = await fixture(); f.state.latestMissing = true;
  await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({ code: 'RENDERING_STYLE_NOT_FOUND' });
});

test('replay rejects missing summary, older publication and unexpected result version without storage', async () => {
  for (const patch of [{ published_version: null }, { published_at: null }, { published_version: 1 }, { version: 1 }]) {
    const f = await fixture(); Object.assign(f.current, summary, { status: 'published', version: 2 }, patch);
    f.state.begin = succeeded;
    await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({ code: 'DB_ERROR' });
    expect(f.events).not.toContain('config');
  }
  const f = await fixture(); Object.assign(f.current, summary, { status: 'published', version: 2 });
  f.state.begin = { ...succeeded, result_version: 3 };
  await expect(f.service.publish(makeAuth(), styleId, body)).rejects.toMatchObject({ code: 'DB_ERROR' });
  expect(f.events).not.toContain('config');
});
