import { expect, test } from 'bun:test';
import COS from 'cos-nodejs-sdk-v5';
import { Writable } from 'node:stream';
import { createHash } from 'node:crypto';
import { CustomerRenderingInputStorage } from './client';

// Offline SDK capability gate: no requests, credentials or signed URLs leave this process.
test('installed COS signer binds supported headers but excludes Content-Type', () => {
  const cos = new COS({ SecretId: 'offline-test-id', SecretKey: 'offline-test-key' });
  const authorization = cos.getAuth({
    Bucket: 'rendering-123456', Region: 'ap-guangzhou',
    Key: 'private/customer-rendering-inputs/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/raw',
    Method: 'PUT', Expires: 600, ForceSignHost: true,
    Headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': '1024',
      'x-cos-forbid-overwrite': 'true',
      'x-cos-acl': 'private',
    },
  });
  const headerList = new URLSearchParams(authorization).get('q-header-list')?.split(';');
  expect(headerList).toContain('content-length');
  expect(headerList).toContain('host');
  expect(headerList).toContain('x-cos-forbid-overwrite');
  expect(headerList).toContain('x-cos-acl');
  expect(headerList).not.toContain('content-type');
});

const tenant = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const config = { bucket: 'rendering-123456', region: 'ap-guangzhou', secretId: 'offline-id', secretKey: 'offline-key' };
const raw = { bucket: config.bucket, region: config.region, object_key: `private/customer-rendering-inputs/${tenant}/${id}/raw` };
function fixture() {
  const calls: { operation: string; params: unknown }[] = [];
  const state = { config: { ...config }, body: Buffer.from('raw'), mime: 'image/png', length: '3', putError: false, headError: false,
    mutateAuth: (auth: string) => auth };
  const storage = new CustomerRenderingInputStorage({ loadConfig: async () => state.config, createCos: (options) => ({
    getAuth: (params) => state.mutateAuth(new COS(options).getAuth(params)),
    async headObject(params) {
      calls.push({ operation: 'head', params });
      if (state.headError) throw { statusCode: 404 };
      return { ETag: 'etag', statusCode: 200, headers: { 'content-type': state.mime, 'content-length': state.length,
        'x-cos-meta-sha256': createHash('sha256').update(state.body).digest('hex') } };
    },
    async getObject(params) {
      calls.push({ operation: 'get', params });
      if (params.Output instanceof Writable) params.Output.end(state.body);
      return { ETag: 'etag', statusCode: 200, Body: state.body };
    },
    async putObject(params) { calls.push({ operation: 'put', params }); if (state.putError) throw { statusCode: 503 }; },
    async deleteObject(params) { calls.push({ operation: 'delete', params }); },
  }) });
  return { storage, calls, state };
}

test('issuance returns exact persisted location and ten-minute signed private raw PUT', async () => {
  const { storage } = fixture();
  const signed = await storage.signPut(tenant, id, 'image/png', 3);
  expect(signed.location).toEqual(raw);
  const url = new URL(signed.uploadUrl);
  expect(url.protocol).toBe('https:');
  expect(url.host).toBe(`${config.bucket}.cos.${config.region}.myqcloud.com`);
  expect(url.pathname).toBe(`/${raw.object_key}`);
  expect(url.searchParams.get('q-header-list')).toBe('content-length;host;x-cos-acl;x-cos-forbid-overwrite');
  expect(signed.headers).toEqual({ 'Content-Type': 'image/png', 'Content-Length': '3', 'x-cos-acl': 'private', 'x-cos-forbid-overwrite': 'true' });
  const [start, end] = url.searchParams.get('q-sign-time')!.split(';').map(Number);
  expect(end! - start!).toBe(600);
  expect(Date.parse(signed.expiresAt)).toBe(end! * 1000);
});

test('HEAD then bounded GET uses persisted location after default changes', async () => {
  const { storage, calls, state } = fixture();
  state.config.bucket = 'new-default-654321';
  expect(await storage.readRaw(tenant, id, raw, 3, 'image/png')).toEqual(Buffer.from('raw'));
  expect(calls.map((call) => call.operation)).toEqual(['head', 'get']);
  expect(calls[0]?.params).toMatchObject({ Bucket: raw.bucket, Region: raw.region, Key: raw.object_key });
});

test('metadata mismatch refuses GET and streaming rejects overflow or short body', async () => {
  for (const change of [{ mime: 'text/html' }, { length: '4' }, { length: '10485761' }]) {
    const { storage, state, calls } = fixture(); Object.assign(state, change);
    await expect(storage.readRaw(tenant, id, raw, 3, 'image/png')).rejects.toMatchObject({ code: 'RENDERING_INPUT_STORAGE_FAILED' });
    expect(calls.map((call) => call.operation)).toEqual(['head']);
  }
  for (const body of [Buffer.alloc(4), Buffer.alloc(2), Buffer.alloc(10 * 1024 * 1024 + 1)]) {
    const { storage, state } = fixture(); state.body = body;
    await expect(storage.readRaw(tenant, id, raw, 3, 'image/png')).rejects.toMatchObject({ code: 'RENDERING_INPUT_STORAGE_FAILED' });
  }
});

test('invalid sizes MIME ids and cross-tenant/noncanonical persisted locations fail before cloud calls', async () => {
  const { storage, calls } = fixture();
  for (const location of [{ ...raw, object_key: raw.object_key.replace(tenant, id) }, { ...raw, bucket: 'https://evil' },
    { ...raw, region: 'ap-guangzhou/evil' }, { ...raw, object_key: raw.object_key + '/../raw' }]) {
    await expect(storage.readRaw(tenant, id, location, 3, 'image/png')).rejects.toMatchObject({ statusCode: 503 });
    await expect(storage.removeRaw(tenant, id, location)).rejects.toMatchObject({ statusCode: 503 });
  }
  for (const size of [0, 10 * 1024 * 1024 + 1, 1.1]) await expect(storage.signPut(tenant, id, 'image/png', size)).rejects.toMatchObject({ statusCode: 503 });
  await expect(storage.signPut(tenant, id, 'image/heic', 3)).rejects.toMatchObject({ statusCode: 503 });
  expect(() => storage.rawObjectKey('../tenant', id)).toThrow();
  expect(calls).toEqual([]);
});

test('normalized PUT is immutable/private and verified by HEAD; unknown result remains recoverable', async () => {
  const { storage, calls, state } = fixture();
  state.mime = 'image/webp';
  const normalized = { ...raw, object_key: storage.normalizedObjectKey(tenant, id) };
  await storage.putNormalized(tenant, id, normalized, Buffer.from('raw'));
  expect(calls.map((call) => call.operation)).toEqual(['put', 'head']);
  expect(calls[0]?.params).toMatchObject({ Bucket: raw.bucket, Key: normalized.object_key, ContentType: 'image/webp',
    ContentLength: 3, ACL: 'private', Headers: { 'x-cos-forbid-overwrite': 'true' } });
  state.putError = true;
  await expect(storage.putNormalized(tenant, id, normalized, Buffer.from('raw'))).rejects.toMatchObject({ code: 'RENDERING_INPUT_STORAGE_NORMALIZED_UNKNOWN' });
  expect(await storage.hasNormalized(tenant, id, normalized, Buffer.from('raw'))).toBe(true);
  expect(calls.some((call) => call.operation === 'delete')).toBe(false);
});

test('cleanup deletes canonical raw only; normalized verification reports missing objects', async () => {
  const { storage, calls, state } = fixture();
  await storage.removeRaw(tenant, id, raw);
  expect(calls[0]).toEqual({ operation: 'delete', params: { Bucket: raw.bucket, Region: raw.region, Key: raw.object_key } });
  const normalized = { ...raw, object_key: storage.normalizedObjectKey(tenant, id) };
  await expect(storage.removeRaw(tenant, id, normalized)).rejects.toMatchObject({ statusCode: 503 });
  state.headError = true;
  expect(await storage.hasNormalized(tenant, id, normalized, Buffer.from('raw'))).toBe(false);
});

test('persisted issuance and normalized writes survive default location change', async () => {
  const { storage, state, calls } = fixture();
  expect(await storage.location(tenant, id)).toEqual(raw);
  state.config.bucket = 'new-default-654321'; state.config.region = 'ap-shanghai';
  expect((await storage.signPut(tenant, id, 'image/png', 3, raw)).location).toEqual(raw);
  state.mime = 'image/webp';
  await storage.putNormalized(tenant, id, { ...raw, object_key: storage.normalizedObjectKey(tenant, id) }, state.body);
  expect(calls[0]?.params).toMatchObject({ Bucket: raw.bucket, Region: raw.region });
});

test('invalid signing result and invalid current credentials fail safely', async () => {
  for (const mutate of [(auth: string) => auth.replace('content-length;', ''),
    (auth: string) => auth.replace('q-signature=', 'missing='),
    (auth: string) => auth.replace(/q-sign-time=[^&]+/, 'q-sign-time=1;601')]) {
    const { storage, state } = fixture(); state.mutateAuth = mutate;
    await expect(storage.signPut(tenant, id, 'image/png', 3)).rejects.toMatchObject({ code: 'RENDERING_INPUT_STORAGE_FAILED' });
  }
  const { storage, state, calls } = fixture(); state.config.secretKey = '';
  await expect(storage.readRaw(tenant, id, raw, 3, 'image/png')).rejects.toMatchObject({ code: 'RENDERING_INPUT_STORAGE_UNAVAILABLE' });
  expect(calls).toEqual([]);
});

test('normalized metadata mismatch is unknown and recovery requires exact bytes checksum', async () => {
  const { storage, state } = fixture();
  const normalized = { ...raw, object_key: storage.normalizedObjectKey(tenant, id) };
  await expect(storage.putNormalized(tenant, id, normalized, state.body)).rejects.toMatchObject({ code: 'RENDERING_INPUT_STORAGE_NORMALIZED_UNKNOWN' });
  state.mime = 'image/webp';
  expect(await storage.hasNormalized(tenant, id, normalized, Buffer.from('bad'))).toBe(false);
});
