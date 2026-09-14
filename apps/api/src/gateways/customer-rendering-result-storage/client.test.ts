import { createHash } from 'node:crypto';
import { expect, test } from 'bun:test';
import COS from 'cos-nodejs-sdk-v5';
import {
  CustomerRenderingResultStorage,
  type CustomerRenderingResultCosPort,
} from './client';

const tenantId = '11111111-1111-4111-8111-111111111111';
const jobId = '22222222-2222-4222-8222-222222222222';
const attemptId = '33333333-3333-4333-8333-333333333333';
const config = { bucket: 'rendering-123456', region: 'ap-guangzhou', secretId: 'offline-id', secretKey: 'offline-key' };
const bytes = Buffer.from('RIFF\x00\x00\x00\x00WEBPimage');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const key = `private/customer-rendering-results/${tenantId}/${jobId}/${attemptId}/result.webp`;
const location = { bucket: config.bucket, region: config.region, object_key: key };

function fixture() {
  const calls: Array<{ operation: 'put' | 'head'; params: unknown }> = [];
  const state = {
    stored: null as null | { sizeBytes: number; sha256: string; mimeType: string },
    putFailure: false,
    headFailure: false,
    mutateSignedUrl: (url: string) => url,
    currentConfig: { ...config },
  };
  const cos: CustomerRenderingResultCosPort = {
    getObjectUrl(params) { return state.mutateSignedUrl(new COS({ SecretId: config.secretId, SecretKey: config.secretKey }).getObjectUrl(params)); },
    async putObject(params) {
      calls.push({ operation: 'put', params });
      if (state.stored) throw { statusCode: 409, message: 'secret: object exists' };
      state.stored = {
        sizeBytes: params.ContentLength ?? 0,
        sha256: String(params.Headers?.['x-cos-meta-sha256']),
        mimeType: params.ContentType ?? '',
      };
      if (state.putFailure) throw { code: 'ECONNRESET', message: 'secret: response lost' };
      return {};
    },
    async headObject(params) {
      calls.push({ operation: 'head', params });
      if (state.headFailure) throw { code: 'ETIMEDOUT', message: 'secret: head failed' };
      if (!state.stored) throw { statusCode: 404 };
      return { statusCode: 200, ETag: 'etag', headers: {
        'content-length': String(state.stored.sizeBytes),
        'content-type': state.stored.mimeType,
        'x-cos-meta-sha256': state.stored.sha256,
      } };
    },
  };
  const storage = new CustomerRenderingResultStorage({
    loadConfig: async () => state.currentConfig,
    createCos: () => cos,
  });
  return { storage, calls, state };
}

test('writes a private immutable attempt result and verifies HEAD checksum', async () => {
  const { storage, calls } = fixture();
  expect(await storage.location(tenantId, jobId, attemptId)).toEqual(location);
  expect(await storage.put(tenantId, jobId, attemptId, location, bytes)).toEqual({ location, sizeBytes: bytes.length, sha256 });
  expect(calls.map((call) => call.operation)).toEqual(['put', 'head']);
  expect(calls[0]?.params).toMatchObject({ Bucket: config.bucket, Region: config.region, Key: key,
    Body: bytes, ContentLength: bytes.length, ContentType: 'image/webp', ACL: 'private',
    CacheControl: 'private, no-store',
    Headers: { 'x-cos-forbid-overwrite': 'true', 'x-cos-meta-sha256': sha256 },
  });
  expect(await storage.inspect(tenantId, jobId, attemptId, location, { sizeBytes: bytes.length, sha256 })).toBe('matching');
});

test('recovers a committed PUT with lost response only after matching HEAD', async () => {
  const { storage, state, calls } = fixture();
  state.putFailure = true;
  expect(await storage.put(tenantId, jobId, attemptId, location, bytes)).toEqual({ location, sizeBytes: bytes.length, sha256 });
  expect(calls.map((call) => call.operation)).toEqual(['put', 'head']);
  expect(calls.filter((call) => call.operation === 'put')).toHaveLength(1);
});

test('unknown PUT and failed HEAD remain unknown, while restart inspection can verify the object', async () => {
  const { storage, state } = fixture();
  state.putFailure = true;
  state.headFailure = true;
  await expect(storage.put(tenantId, jobId, attemptId, location, bytes))
    .rejects.toMatchObject({ code: 'RENDERING_RESULT_STORAGE_UNKNOWN', message: '客户生图结果写入状态未知' });
  state.headFailure = false;
  expect(await storage.inspect(tenantId, jobId, attemptId, location, { sizeBytes: bytes.length, sha256 })).toBe('matching');
});

test('missing or mismatched result is never treated as a successful write', async () => {
  const { storage, state } = fixture();
  expect(await storage.inspect(tenantId, jobId, attemptId, location, { sizeBytes: bytes.length, sha256 })).toBe('missing');
  state.stored = { sizeBytes: bytes.length, sha256: '0'.repeat(64), mimeType: 'image/webp' };
  expect(await storage.inspect(tenantId, jobId, attemptId, location, { sizeBytes: bytes.length, sha256 })).toBe('mismatch');
  await expect(storage.put(tenantId, jobId, attemptId, location, bytes))
    .rejects.toMatchObject({ code: 'RENDERING_RESULT_STORAGE_CONFLICT' });
});

test('rejects noncanonical location and invalid digest before COS', async () => {
  const { storage, calls } = fixture();
  await expect(storage.put(tenantId, jobId, attemptId,
    { ...location, object_key: `${key}/../result.webp` }, bytes))
    .rejects.toMatchObject({ code: 'RENDERING_RESULT_STORAGE_UNAVAILABLE' });
  await expect(storage.inspect(tenantId, jobId, attemptId, location,
    { sizeBytes: bytes.length, sha256: 'bad' }))
    .rejects.toMatchObject({ code: 'RENDERING_RESULT_STORAGE_UNAVAILABLE' });
  await expect(storage.put(tenantId, jobId, attemptId, location, Buffer.alloc(0)))
    .rejects.toMatchObject({ code: 'RENDERING_RESULT_STORAGE_UNAVAILABLE' });
  await expect(storage.location('../tenant', jobId, attemptId))
    .rejects.toMatchObject({ code: 'RENDERING_RESULT_STORAGE_UNAVAILABLE' });
  expect(calls).toEqual([]);
});

test('uses persisted bucket after default storage configuration changes', async () => {
  const { storage, state, calls } = fixture();
  state.currentConfig.bucket = 'new-default-654321';
  expect(await storage.put(tenantId, jobId, attemptId, location, bytes)).toEqual({ location, sizeBytes: bytes.length, sha256 });
  expect(calls[0]?.params).toMatchObject({ Bucket: config.bucket, Region: config.region });
});

test('signs a ten-minute private result GET at the persisted canonical attempt location', async () => {
  const { storage, state } = fixture();
  state.currentConfig.bucket = 'new-default-654321';
  state.currentConfig.region = 'ap-shanghai';
  const signed = await storage.signResultRead(tenantId, jobId, attemptId, location);
  const url = new URL(signed.url);
  expect(url.protocol).toBe('https:');
  expect(url.host).toBe(`${location.bucket}.cos.${location.region}.myqcloud.com`);
  expect(url.pathname).toBe(`/${key}`);
  expect(url.searchParams.get('q-sign-algorithm')).toBe('sha1');
  expect(url.searchParams.get('q-header-list')).toBe('host');
  expect(url.searchParams.get('q-signature')).toMatch(/^[a-f0-9]{40}$/);
  const [start, end] = url.searchParams.get('q-sign-time')!.split(';').map(Number);
  expect(end! - start!).toBe(600);
  expect(Date.parse(signed.expiresAt)).toBe(end! * 1000);
});

test('result signer refuses foreign keys and malformed SDK URLs', async () => {
  const { storage, state } = fixture();
  await expect(storage.signResultRead(tenantId, jobId, attemptId,
    { ...location, object_key: key.replace(tenantId, jobId) }))
    .rejects.toMatchObject({ code: 'RENDERING_RESULT_STORAGE_UNAVAILABLE' });
  state.mutateSignedUrl = (url) => url.replace(`${location.bucket}.cos`, 'evil.example.com');
  await expect(storage.signResultRead(tenantId, jobId, attemptId, location))
    .rejects.toMatchObject({ code: 'RENDERING_RESULT_STORAGE_FAILED' });
  state.mutateSignedUrl = (url) => url.replace('q-sign-time=', 'wrong-time=');
  await expect(storage.signResultRead(tenantId, jobId, attemptId, location))
    .rejects.toMatchObject({ code: 'RENDERING_RESULT_STORAGE_FAILED' });
});
