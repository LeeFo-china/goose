import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import COS from 'cos-nodejs-sdk-v5';
import { Errors } from '@/errors/error-factory';
import { RenderingLibraryStorage, loadRenderingStorageConfig, type RenderingPublicCopyInput } from './client';

const tenant = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const config = { bucket: 'rendering-123456', region: 'ap-guangzhou', secretId: 'dummy-id', secretKey: 'dummy-key' };
const location = { bucket: config.bucket, region: config.region, object_key: `private/renovation-styles/${tenant}/${id}.webp` };
const signedUrl = `https://${config.bucket}.cos.${config.region}.myqcloud.com/${location.object_key}?q-sign-algorithm=sha1&q-signature=dummy`;
const canonicalBase = `https://${config.bucket}.cos.${config.region}.myqcloud.com/`;
const styleId = '33333333-3333-4333-8333-333333333333';
const sourceBytes = Buffer.from('normalized webp');
const checksum = createHash('sha256').update(sourceBytes).digest('hex');
const publicLocation = { ...location, object_key: `public/renovation-styles/${tenant}/${styleId}/1.webp` };
const copyInput: RenderingPublicCopyInput = { tenantId: tenant, styleId, sourceFileId: id, targetVersion: 1,
  sourceChecksum: checksum, sourceSizeBytes: sourceBytes.length, sourceLocation: location, publicLocation };

function publicHead(): COS.HeadObjectResult {
  return { ETag: 'dummy-etag', statusCode: 200, headers: { 'content-length': String(sourceBytes.length),
    'content-type': 'image/webp', 'x-cos-meta-source-sha256': checksum } };
}

function fixture() {
  const calls: unknown[][] = [];
  const state = { config: { ...config, publicBaseUrl: '' }, url: signedUrl, fail: false, failPut: false,
    body: sourceBytes as unknown, head: publicHead(), headError: undefined as unknown };
  const storage = new RenderingLibraryStorage({
    loadConfig: async () => state.config,
    createCos: (options) => {
      calls.push(['construct', options]);
      return {
        async getObject(params): Promise<COS.GetObjectResult> {
          calls.push(['get', params]);
          if (state.fail) throw Errors.badRequest('raw key signature secret');
          // Deliberately allow malformed runtime SDK output to test the trust boundary.
          return { Body: state.body as Buffer, ETag: 'dummy-etag', statusCode: 200 };
        },
        async headObject(params): Promise<COS.HeadObjectResult> {
          calls.push(['head', params]);
          if (state.headError) throw state.headError;
          return state.head;
        },
        async putObject(params) {
          calls.push(['put', params]);
          if (state.fail || state.failPut) throw Errors.badRequest('raw key signature secret');
        },
        getObjectUrl(params) {
          calls.push(['preview', params]);
          if (state.fail) throw Errors.badRequest('raw key signature secret');
          return state.url;
        },
      };
    },
  });
  return { storage, calls, state };
}

test('configuration requires exact COS provider and all valid settings with fixed unavailable errors', async () => {
  const values: Record<string, string> = {
    PLATFORM_STORAGE_PROVIDER: 'tencent_cos', PLATFORM_COS_BUCKET: config.bucket,
    PLATFORM_COS_REGION: config.region, TENCENT_COS_SECRET_ID: config.secretId, TENCENT_COS_SECRET_KEY: config.secretKey,
  };
  const settings = { getString: async (key: string) => values[key] ?? '', getSecretString: async (key: string) => values[key] ?? '' };
  expect(await loadRenderingStorageConfig(settings)).toEqual({ ...config, publicBaseUrl: canonicalBase });
  for (const [key, value] of Object.entries(values)) {
    values[key] = '';
    await expect(loadRenderingStorageConfig(settings)).rejects.toMatchObject({ statusCode: 503, code: 'RENDERING_STORAGE_UNAVAILABLE' });
    values[key] = value;
  }
  for (const provider of ['supabase', 'TENCENT_COS', ' tencent_cos']) {
    await expect(loadRenderingStorageConfig({ ...settings, getString: async (key) => key === 'PLATFORM_STORAGE_PROVIDER' ? provider : values[key] ?? '' }))
      .rejects.toMatchObject({ statusCode: 503, code: 'RENDERING_STORAGE_UNAVAILABLE' });
  }
  for (const patch of [{ bucket: 'https://bucket' }, { bucket: 'bucket' }, { region: '123-456' },
    { region: 'ap-guangzhou/evil' }, { region: 'a-'.repeat(40) }, { secretId: ' ' }]) {
    const storage = new RenderingLibraryStorage({ loadConfig: async () => ({ ...config, ...patch }) });
    await expect(storage.location(tenant, id)).rejects.toMatchObject({ statusCode: 503 });
  }
  const unavailable = new RenderingLibraryStorage({ loadConfig: async () => { throw Errors.badRequest('secret'); } });
  await expect(unavailable.location(tenant, id)).rejects.toMatchObject({ statusCode: 503, message: '装修效果素材存储暂不可用' });
});

test('canonical private writes use verified installed COS options and no public URL', async () => {
  const { storage, calls } = fixture();
  expect(await storage.location(tenant, id)).toEqual(location);
  const bytes = Buffer.from('normalized webp');
  await storage.put(tenant, id, location, bytes);
  expect(calls).toEqual([
    ['construct', { SecretId: config.secretId, SecretKey: config.secretKey, Protocol: 'https:', Timeout: 30000, FollowRedirect: false }],
    ['put', { Bucket: config.bucket, Region: config.region, Key: location.object_key,
      Body: bytes, ContentLength: bytes.length, ContentType: 'image/webp', ACL: 'private', CacheControl: 'private, no-store' }],
  ]);
  expect(await storage.preview(tenant, id, location)).toBe(signedUrl);
  expect(calls).toContainEqual(['preview', { Bucket: config.bucket, Region: config.region, Key: location.object_key,
    Sign: true, Method: 'GET', Expires: 120, Protocol: 'https:' }]);
});

test('invalid identifiers, paths, moved configuration and byte limits fail before SDK calls', async () => {
  const { storage, calls, state } = fixture();
  await expect(storage.location('bad', id)).rejects.toMatchObject({ statusCode: 503 });
  await expect(storage.location(tenant, 'bad')).rejects.toMatchObject({ statusCode: 503 });
  for (const patch of [{ bucket: 'other-123' }, { region: 'ap-singapore' },
    { object_key: `${location.object_key}/../x` }, { object_key: location.object_key.replace(id, tenant) }]) {
    await expect(storage.put(tenant, id, { ...location, ...patch }, Buffer.from('x'))).rejects.toMatchObject({ statusCode: 503 });
    await expect(storage.preview(tenant, id, { ...location, ...patch })).rejects.toMatchObject({ statusCode: 503 });
  }
  for (const bytes of [Buffer.alloc(0), Buffer.alloc(10 * 1024 * 1024 + 1)]) {
    await expect(storage.put(tenant, id, location, bytes)).rejects.toMatchObject({ statusCode: 503 });
  }
  state.config.region = 'ap-singapore';
  await expect(storage.preview(tenant, id, location)).rejects.toMatchObject({ statusCode: 503 });
  expect(await storage.location(tenant, id)).toEqual({ ...location, region: 'ap-singapore' });
  expect(calls).toEqual([]);
});

test('SDK errors, unsigned URLs, HTTP, userinfo and non-COS hosts never escape gateway', async () => {
  const { storage, state } = fixture();
  state.fail = true;
  for (const call of [() => storage.put(tenant, id, location, Buffer.from('x')), () => storage.preview(tenant, id, location)]) {
    await expect(call()).rejects.toMatchObject({ statusCode: 502, code: 'RENDERING_STORAGE_FAILED', message: '装修效果素材存储操作失败', details: undefined });
  }
  state.fail = false;
  for (const url of [signedUrl.replace('https:', 'http:'), signedUrl.replace('https://', 'https://user:pass@'),
    signedUrl.replace('.myqcloud.com', '.myqcloud.com.evil.test'), signedUrl.split('?')[0]!,
    signedUrl.replace('q-signature=dummy', 'q-signature='), 'not a URL']) {
    state.url = url;
    await expect(storage.preview(tenant, id, location)).rejects.toMatchObject({ statusCode: 502 });
  }
  const failedFactory = new RenderingLibraryStorage({ loadConfig: async () => config,
    createCos: () => { throw Errors.badRequest('secret credentials'); } });
  await expect(failedFactory.preview(tenant, id, location)).rejects.toMatchObject({ statusCode: 502 });
});

test('real COS signing with dummy static credentials is local and expires after 120 seconds', async () => {
  const storage = new RenderingLibraryStorage({ loadConfig: async () => config, createCos: (options) => new COS(options) });
  const url = new URL(await storage.preview(tenant, id, location));
  expect(url.host).toBe(`${config.bucket}.cos.${config.region}.myqcloud.com`);
  expect(url.pathname).toBe(`/${location.object_key}`);
  expect(url.searchParams.get('q-signature')).toMatch(/^[a-f0-9]{40}$/);
  const times = url.searchParams.get('q-sign-time')!.split(';').map(Number);
  expect(times[1]! - times[0]!).toBe(120);
});

test('public base setting is read, falls back when empty and normalizes trailing slash', async () => {
  for (const [value, expected] of [['', canonicalBase], ['https://cdn.example.test', 'https://cdn.example.test/'],
    ['https://cdn.example.test/', 'https://cdn.example.test/']]) {
    const reads: string[] = [];
    const values: Record<string, string> = { PLATFORM_STORAGE_PROVIDER: 'tencent_cos', PLATFORM_COS_BUCKET: config.bucket,
      PLATFORM_COS_REGION: config.region, PLATFORM_COS_PUBLIC_BASE_URL: value! };
    const loaded = await loadRenderingStorageConfig({ getString: async (key) => { reads.push(key); return values[key] ?? ''; },
      getSecretString: async (key) => key === 'TENCENT_COS_SECRET_ID' ? config.secretId : config.secretKey });
    expect(loaded.publicBaseUrl).toBe(expected!);
    expect(reads).toContain('PLATFORM_COS_PUBLIC_BASE_URL');
  }
});

test('malicious or mismatched public bases are rejected before COS calls', async () => {
  for (const base of ['http://cdn.example.test', 'https://user:pass@cdn.example.test', 'https://@cdn.example.test', 'https://cdn.example.test?x=1',
    'https://cdn.example.test#x', 'https://cdn.example.test?', 'https://cdn.example.test#',
    'https://cdn.example.test/assets/', 'https://cdn.example.test/assets/../', 'https://cdn.example.test/%2e%2e/',
    'https://cdn.example.test/\\evil', ' https://cdn.example.test', 'not a URL']) {
    const { storage, calls, state } = fixture();
    state.config.publicBaseUrl = base;
    await expect(storage.copyPublic(copyInput)).rejects.toMatchObject({ code: 'RENDERING_STORAGE_UNAVAILABLE', details: undefined });
    await expect(storage.hasPublicCopy(copyInput)).rejects.toMatchObject({ code: 'RENDERING_STORAGE_UNAVAILABLE' });
    expect(calls).toEqual([]);
  }
});

test('public copy reads only the private source and puts one deterministic immutable public object', async () => {
  for (const base of ['', 'https://cdn.example.test/']) {
    const { storage, calls, state } = fixture();
    state.config.publicBaseUrl = base;
    const result = await storage.copyPublic(copyInput);
    expect(result).toEqual({ publicUrl: `${base || canonicalBase}${publicLocation.object_key}` });
    expect(calls).toEqual([
      ['construct', { SecretId: config.secretId, SecretKey: config.secretKey, Protocol: 'https:', Timeout: 30000, FollowRedirect: false }],
      ['get', { Bucket: config.bucket, Region: config.region, Key: location.object_key }],
      ['put', { Bucket: config.bucket, Region: config.region, Key: publicLocation.object_key, Body: sourceBytes,
        ContentLength: sourceBytes.length, ContentType: 'image/webp', ACL: 'public-read',
        CacheControl: 'public, max-age=31536000, immutable', 'x-cos-meta-source-sha256': checksum }],
    ]);
    for (const value of [copyInput, result]) {
      expect(JSON.stringify(value)).not.toContain(config.secretId);
      expect(JSON.stringify(value)).not.toContain(config.secretKey);
    }
    const url = new URL(result.publicUrl);
    expect(decodeURIComponent(url.pathname)).toBe(`/${publicLocation.object_key}`);
    expect(url.username + url.password + url.search + url.hash).toBe('');
  }
});

test('public copy validates every identity, limit and location before SDK calls', async () => {
  const patches: Partial<RenderingPublicCopyInput>[] = [
    { tenantId: 'bad' }, { tenantId: id }, { styleId: 'bad' }, { styleId: id },
    { sourceFileId: 'bad' }, { sourceFileId: tenant },
    ...[0, -1, 1.1, 2147483648, NaN].map((targetVersion) => ({ targetVersion })),
    ...['', 'A'.repeat(64), 'a'.repeat(63), '../x'].map((sourceChecksum) => ({ sourceChecksum })),
    ...[0, -1, 1.1, 10 * 1024 * 1024 + 1, NaN].map((sourceSizeBytes) => ({ sourceSizeBytes })),
  ];
  for (const key of ['sourceLocation', 'publicLocation'] as const) {
    const original = copyInput[key];
    for (const patch of [{ bucket: 'other-123456' }, { region: 'ap-singapore' }, { object_key: `${original.object_key}/../x` },
      { object_key: original.object_key.replace(tenant, id) }, { object_key: original.object_key.replace('.webp', '.png') }]) {
      patches.push({ [key]: { ...original, ...patch } });
    }
  }
  patches.push({ publicLocation: location }, { sourceLocation: publicLocation }, { targetVersion: 2 });
  for (const patch of patches) {
    const { storage, calls } = fixture();
    await expect(storage.copyPublic({ ...copyInput, ...patch })).rejects.toMatchObject({ code: 'RENDERING_STORAGE_UNAVAILABLE' });
    await expect(storage.hasPublicCopy({ ...copyInput, ...patch })).rejects.toMatchObject({ code: 'RENDERING_STORAGE_UNAVAILABLE' });
    expect(calls).toEqual([]);
  }
});

test('public copy rejects corrupt, non-buffer, empty, oversize and size-mismatched source bodies before put', async () => {
  for (const body of ['normalized webp', new Uint8Array(sourceBytes), null, Buffer.alloc(0),
    Buffer.alloc(10 * 1024 * 1024 + 1), Buffer.from('x'), Buffer.alloc(sourceBytes.length)]) {
    const { storage, calls, state } = fixture();
    state.body = body;
    await expect(storage.copyPublic(copyInput)).rejects.toMatchObject({ statusCode: 502, code: 'RENDERING_STORAGE_FAILED', details: undefined });
    expect(calls.filter(([method]) => method === 'put')).toHaveLength(0);
  }
});

test('HEAD recovery verifies headers without rereading or duplicating the copy', async () => {
  const { storage, calls } = fixture();
  expect(await storage.hasPublicCopy(copyInput)).toBe(true);
  expect(calls).toEqual([
    ['construct', { SecretId: config.secretId, SecretKey: config.secretKey, Protocol: 'https:', Timeout: 30000, FollowRedirect: false }],
    ['head', { Bucket: config.bucket, Region: config.region, Key: publicLocation.object_key }],
  ]);
});

test('HEAD recovery requires exact size, type and checksum metadata', async () => {
  const valid = publicHead().headers!;
  for (const headers of [undefined, {}, { ...valid, 'content-length': '0' }, { ...valid, 'content-length': `${sourceBytes.length}x` },
    { ...valid, 'content-type': 'image/png' }, { ...valid, 'content-type': undefined },
    { ...valid, 'x-cos-meta-source-sha256': 'a'.repeat(64) }, { ...valid, 'x-cos-meta-source-sha256': undefined }]) {
    const { storage, state } = fixture();
    state.head = { ETag: 'dummy', headers };
    expect(await storage.hasPublicCopy(copyInput)).toBe(false);
  }
});

test('SDK-compatible not-found errors return false and other failures are sanitized', async () => {
  const sdkError: COS.CosSdkError = { statusCode: 404, code: 'NoSuchKey', message: 'raw secret',
    error: { Code: 'NoSuchKey', Message: 'raw secret' }, url: `https://secret.test/${publicLocation.object_key}`, method: 'HEAD' };
  for (const headError of [sdkError, { ...sdkError, code: 'NotFound' }, { ...sdkError, statusCode: undefined }]) {
    const { storage, state } = fixture();
    state.headError = headError;
    expect(await storage.hasPublicCopy(copyInput)).toBe(false);
  }
  const { storage, state } = fixture();
  state.headError = { ...sdkError, statusCode: 403, code: 'AccessDenied' };
  await expect(storage.hasPublicCopy(copyInput)).rejects.toMatchObject({ statusCode: 502, code: 'RENDERING_STORAGE_FAILED',
    message: '装修效果素材存储操作失败', details: undefined });
  state.fail = true;
  await expect(storage.copyPublic(copyInput)).rejects.toMatchObject({ statusCode: 502, code: 'RENDERING_STORAGE_FAILED', details: undefined });
  state.fail = false;
  state.failPut = true;
  await expect(storage.copyPublic(copyInput)).rejects.toMatchObject({ statusCode: 502, code: 'RENDERING_STORAGE_FAILED', details: undefined });
});

test('public copy accepts maximum version and source size at their inclusive boundaries', async () => {
  const { storage, calls, state } = fixture();
  const bytes = Buffer.alloc(10 * 1024 * 1024, 1);
  state.body = bytes;
  const input = { ...copyInput, targetVersion: 2147483647, sourceSizeBytes: bytes.length,
    sourceChecksum: createHash('sha256').update(bytes).digest('hex'),
    publicLocation: { ...publicLocation, object_key: publicLocation.object_key.replace('/1.webp', '/2147483647.webp') } };
  expect(await storage.copyPublic(input)).toEqual({ publicUrl: `${canonicalBase}${input.publicLocation.object_key}` });
  expect(calls.filter(([method]) => method === 'put')).toHaveLength(1);
});
