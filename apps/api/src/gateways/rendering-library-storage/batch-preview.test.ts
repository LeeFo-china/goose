import { expect, test } from 'bun:test';
import COS from 'cos-nodejs-sdk-v5';
import { Errors } from '@/errors/error-factory';
import { RenderingLibraryStorage } from './client';

const tenantId = '11111111-1111-4111-8111-111111111111';
const config = { bucket: 'rendering-123456', region: 'ap-guangzhou', secretId: 'dummy-id', secretKey: 'dummy-key' };
const files = Array.from({ length: 20 }, () => {
  const id = crypto.randomUUID();
  return { id, location: { bucket: config.bucket, region: config.region, object_key: `private/renovation-styles/${tenantId}/${id}.webp` } };
});

function fixture() {
  const calls = { config: 0, cos: 0, sign: 0 };
  const state = { fail: '' };
  const storage = new RenderingLibraryStorage({
    loadConfig: async () => {
      calls.config++;
      if (state.fail === 'config') throw Errors.badRequest('secret config');
      return config;
    },
    createCos: (options) => {
      calls.cos++;
      if (state.fail === 'cos') throw Errors.badRequest('secret key');
      const cos = new COS(options);
      return {
        async putObject() {},
        async getObject(): Promise<never> {
          throw Errors.business(500, '私有预览不得读取对象', 'UNEXPECTED_COS_READ');
        },
        async headObject(): Promise<never> {
          throw Errors.business(500, '私有预览不得检查公开对象', 'UNEXPECTED_COS_HEAD');
        },
        getObjectUrl(params) {
          calls.sign++;
          if (state.fail === 'sign') throw Errors.badRequest('secret signed URL');
          if (state.fail === 'unsigned') return `https://${config.bucket}.cos.${config.region}.myqcloud.com/${params.Key}`;
          return cos.getObjectUrl(params);
        },
      };
    },
  });
  return { storage, calls, state };
}

test('batch signs 20 private locations using one config read and COS instance in supplied order', async () => {
  const { storage, calls } = fixture();
  const result = await storage.previews(tenantId, files);
  expect(calls).toEqual({ config: 1, cos: 1, sign: 20 });
  expect(result).toHaveLength(20);
  result.forEach((signed, index) => {
    const url = new URL(signed);
    expect(url.pathname).toBe(`/${files[index]!.location.object_key}`);
    expect(url.protocol).toBe('https:');
    expect(url.searchParams.get('q-signature')).toMatch(/^[a-f0-9]{40}$/);
    const [start, end] = url.searchParams.get('q-sign-time')!.split(';').map(Number);
    expect(end! - start!).toBe(120);
  });
});

test('batch validates every location before constructing COS or signing any item', async () => {
  for (const patch of [{ bucket: 'other-123' }, { region: 'ap-singapore' }, { object_key: 'private/wrong' }]) {
    const { storage, calls } = fixture();
    const invalid = [...files.slice(0, -1), { ...files[19]!, location: { ...files[19]!.location, ...patch } }];
    await expect(storage.previews(tenantId, invalid)).rejects.toMatchObject({ code: 'RENDERING_STORAGE_UNAVAILABLE', statusCode: 503 });
    expect(calls).toEqual({ config: 1, cos: 0, sign: 0 });
  }
  for (const input of [[], [files[0]!, files[0]!], Array(101).fill(files[0]!), [{ ...files[0]!, id: 'bad' }]]) {
    const { storage, calls } = fixture();
    await expect(storage.previews(tenantId, input)).rejects.toMatchObject({ statusCode: 503 });
    expect(calls.cos).toBe(0);
    expect(calls.sign).toBe(0);
  }
});

test('batch config, COS and signing failures use fixed errors without URL or credential details', async () => {
  for (const fail of ['config', 'cos', 'sign', 'unsigned']) {
    const { storage, state, calls } = fixture();
    state.fail = fail;
    await expect(storage.previews(tenantId, files)).rejects.toMatchObject({
      statusCode: fail === 'config' ? 503 : 502,
      code: fail === 'config' ? 'RENDERING_STORAGE_UNAVAILABLE' : 'RENDERING_STORAGE_FAILED', details: undefined,
      message: fail === 'config' ? '装修效果素材存储暂不可用' : '装修效果素材存储操作失败',
    });
    expect(calls.config).toBe(1);
    expect(calls.sign).toBeLessThanOrEqual(1);
  }
});
