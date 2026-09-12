import { expect, test } from 'bun:test';
import COS from 'cos-nodejs-sdk-v5';
import { Errors } from '@/errors/error-factory';
import { RenderingLibraryStorage, loadRenderingStorageConfig } from './client';

const tenant = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const config = { bucket: 'rendering-123456', region: 'ap-guangzhou', secretId: 'dummy-id', secretKey: 'dummy-key' };
const location = { bucket: config.bucket, region: config.region, object_key: `private/renovation-styles/${tenant}/${id}.webp` };
const signedUrl = `https://${config.bucket}.cos.${config.region}.myqcloud.com/${location.object_key}?q-sign-algorithm=sha1&q-signature=dummy`;

function fixture() {
  const calls: unknown[][] = [];
  const state = { config: { ...config }, url: signedUrl, fail: false };
  const storage = new RenderingLibraryStorage({
    loadConfig: async () => state.config,
    createCos: (options) => {
      calls.push(['construct', options]);
      return {
        async putObject(params) {
          calls.push(['put', params]);
          if (state.fail) throw Errors.badRequest('raw key signature secret');
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
  expect(await loadRenderingStorageConfig(settings)).toEqual(config);
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
