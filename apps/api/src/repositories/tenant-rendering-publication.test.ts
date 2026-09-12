import { expect, test } from 'bun:test';
import type { TenantRenderingPublicationDatabaseClient } from './tenant-rendering-publication';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
const tenantId = '11111111-1111-4111-8111-111111111111';
const styleId = '22222222-2222-4222-8222-222222222222';
const fileId = '33333333-3333-4333-8333-333333333333';
const commandId = '44444444-4444-4444-8444-444444444444';
const key = '55555555-5555-4555-8555-555555555555';
const leaseToken = '66666666-6666-4666-8666-666666666666';
const location = { bucket: 'rendering-123456', region: 'ap-guangzhou', object_key: `private/renovation-styles/${tenantId}/${fileId}.webp` };
const claimed = { decision: 'claimed' as const, command_id: commandId, public_file_id: key, source_file_id: fileId,
  source_location: location, public_location: { ...location, object_key: `public/renovation-styles/${tenantId}/${styleId}/2.webp` },
  source_checksum: 'a'.repeat(64), source_size_bytes: 1024, target_version: 2 };
const succeeded = { decision: 'succeeded' as const, command_id: commandId, result_version: 2 };
const beginInput = { tenantId, styleId, expectedVersion: 1, idempotencyKey: key, requestHash: 'b'.repeat(64), leaseToken };
const completeInput = { tenantId, commandId, leaseToken, publicUrl: `https://cdn.example.test/${claimed.public_location.object_key}`, employeeId: fileId };
const failInput = { tenantId, commandId, leaseToken, failureCode: 'copy_failed' as const };

async function fixture(data: unknown) {
  const { TenantRenderingPublicationRepository } = await import('./tenant-rendering-publication');
  const calls: unknown[][] = [];
  const state = { data, error: null as unknown, rejection: null as unknown };
  // Replace only the Supabase RPC transport, retaining exact parameters and envelopes.
  const client = { async rpc(name: string, params: unknown) {
    calls.push([name, params]);
    if (state.rejection) throw state.rejection;
    return { data: state.data, error: state.error };
  } } as unknown as TenantRenderingPublicationDatabaseClient;
  return { repository: new TenantRenderingPublicationRepository(client), calls, state };
}

test('begin, complete and fail call only exact publication RPCs with trusted explicit parameters', async () => {
  const { repository, calls, state } = await fixture(claimed);
  expect(await repository.begin(beginInput)).toEqual(claimed);
  state.data = succeeded;
  expect(await repository.complete(completeInput)).toEqual(succeeded);
  state.data = { decision: 'failed' };
  expect(await repository.fail(failInput)).toEqual({ decision: 'failed' });
  expect(calls).toEqual([
    ['begin_tenant_rendering_style_publish', { p_tenant_id: tenantId, p_style_id: styleId, p_expected_version: 1,
      p_idempotency_key: key, p_request_hash: beginInput.requestHash, p_lease_token: leaseToken }],
    ['complete_tenant_rendering_style_publish', { p_tenant_id: tenantId, p_command_id: commandId,
      p_lease_token: leaseToken, p_public_url: completeInput.publicUrl, p_employee_id: fileId }],
    ['fail_tenant_rendering_style_publish', { p_tenant_id: tenantId, p_command_id: commandId,
      p_lease_token: leaseToken, p_failure_code: 'copy_failed' }],
  ]);
});

test('repository accepts every stable migration decision and inclusive bounds', async () => {
  const { repository, state } = await fixture(null);
  for (const decision of ['invalid_request', 'not_found', 'idempotency_conflict', 'in_progress', 'lease_conflict', 'version_conflict', 'not_publishable'] as const) {
    state.data = { decision };
    expect(await repository.begin(beginInput)).toEqual({ decision });
  }
  state.data = succeeded;
  expect(await repository.begin(beginInput)).toEqual(succeeded);
  for (const decision of ['not_found', 'lease_conflict', 'version_conflict', 'not_publishable'] as const) {
    state.data = { decision };
    expect(await repository.complete(completeInput)).toEqual({ decision });
  }
  for (const decision of ['invalid_request', 'not_found', 'lease_conflict', 'failed'] as const) {
    state.data = { decision };
    expect(await repository.fail(failInput)).toEqual({ decision });
  }
  state.data = succeeded;
  expect(await repository.fail(failInput)).toEqual(succeeded);
  for (const source_size_bytes of [1, 10 * 1024 * 1024]) {
    state.data = { ...claimed, target_version: 2147483647, source_size_bytes };
    expect(await repository.begin(beginInput)).toEqual({ ...claimed, target_version: 2147483647, source_size_bytes });
  }
});

test('strict decision parsers reject unknown, malformed and extra RPC data with fixed errors', async () => {
  const { repository, state } = await fixture(null);
  for (const data of [null, [], {}, { decision: 'wat' }, { decision: 'not_found', secret: 'raw secret' },
    { ...succeeded, command_id: 'bad' }, { ...succeeded, result_version: 0 }, { ...succeeded, result_version: 1 }, { ...succeeded, result_version: 2147483648 },
    { ...succeeded, result_version: '2' }, { ...succeeded, result_version: 1.1 }, { ...succeeded, secret: 'raw' }]) {
    state.data = data;
    for (const call of [() => repository.begin(beginInput), () => repository.complete(completeInput), () => repository.fail(failInput)]) {
      await expect(call()).rejects.toMatchObject({ code: 'DB_ERROR', message: '装修效果素材发布命令数据格式异常', details: undefined });
    }
  }
  for (const patch of [{ command_id: 'bad' }, { public_file_id: 'bad' }, { source_file_id: 'bad' },
    ...['A'.repeat(64), 'a'.repeat(63), null].map((source_checksum) => ({ source_checksum })),
    ...[0, 1.1, '1024', 10485761].map((source_size_bytes) => ({ source_size_bytes })),
    ...[0, 1, 1.1, 2147483648].map((target_version) => ({ target_version })),
    { source_location: { ...location, secret: 'extra' } }, { source_location: { ...location, region: null } },
    { public_location: { ...location, object_key: '' } }, { public_location: { bucket: location.bucket } },
    { extra: 'secret' }]) {
    state.data = { ...claimed, ...patch };
    await expect(repository.begin(beginInput)).rejects.toMatchObject({ code: 'DB_ERROR', message: '装修效果素材发布命令数据格式异常', details: undefined });
  }
  for (const [call, data] of [
    [() => repository.complete(completeInput), claimed], [() => repository.fail(failInput), claimed],
    [() => repository.complete(completeInput), { decision: 'invalid_request' }],
    [() => repository.fail(failInput), { decision: 'version_conflict' }],
  ] as const) {
    state.data = data;
    await expect(call()).rejects.toMatchObject({ code: 'DB_ERROR' });
  }
});

test('both DB error envelopes and rejected RPC transports are sanitized for every method', async () => {
  const { repository, state } = await fixture(succeeded);
  for (const mode of ['error', 'rejection'] as const) {
    state.error = null;
    state.rejection = null;
    state[mode] = { message: 'raw SQL signature credentials', details: 'secret', code: 'XX000' };
    for (const [call, message] of [
      [() => repository.begin(beginInput), '创建装修效果素材发布命令失败'],
      [() => repository.complete(completeInput), '完成装修效果素材发布失败'],
      [() => repository.fail(failInput), '记录装修效果素材发布失败'],
    ] as const) {
      await expect(call()).rejects.toMatchObject({ code: 'DB_ERROR', message, details: undefined });
    }
  }
});
