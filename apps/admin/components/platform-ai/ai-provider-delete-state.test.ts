import { expect, test } from 'bun:test';
import { deleteAiProvider, providerDeleteError, providerPageAfterDelete } from './ai-provider-delete-state';

const id = '10000000-0000-4000-8000-000000000001';

test('delete sends only explicit version and accepts only matching acknowledgement', async () => {
  const requests: unknown[] = [];
  await deleteAiProvider({ id, version: 7 }, async (path, init) => {
    requests.push([path, init?.method, JSON.parse(String(init?.body))]);
    return { id, deleted: true };
  });
  expect(requests).toEqual([[`/platform/ai-config/providers/${id}`, 'DELETE', { expected_version: 7 }]]);
  for (const ack of [{ id: 'other', deleted: true }, { id, deleted: false }, { id, deleted: true, secret: 'synthetic' }]) {
    await expect(deleteAiProvider({ id, version: 7 }, async () => ack)).rejects.toThrow('删除结果未确认');
  }
});

test('invalid ID or absent/stale-shape version never sends a destructive request', async () => {
  let calls = 0;
  for (const target of [{ id, version: undefined }, { id, version: null }, { id, version: 0 }, { id, version: 1.5 }, { id: '../invalid', version: 1 }]) {
    await expect(deleteAiProvider(target, async () => { calls++; return {}; })).rejects.toThrow();
  }
  expect(calls).toBe(0);
});

test('delete errors are bounded and never repeat an upstream message or retry', async () => {
  expect(providerDeleteError({ code: 'AI_PROVIDER_IN_USE' })).toContain('停用');
  expect(providerDeleteError({ code: 'AI_CONFIG_VERSION_STALE' })).toContain('刷新');
  expect(providerDeleteError({ status: 403 })).toContain('权限');
  expect(providerDeleteError({ message: 'sensitive upstream text' })).not.toContain('sensitive');
  let calls = 0;
  await expect(deleteAiProvider({ id, version: 1 }, async () => { calls++; throw { status: 503 }; })).rejects.toEqual({ status: 503 });
  expect(calls).toBe(1);
});

test('deleting the last visible row retreats a page without ever returning page zero', () => {
  expect(providerPageAfterDelete(2, 1)).toBe(1);
  expect(providerPageAfterDelete(1, 1)).toBe(1);
  expect(providerPageAfterDelete(3, 2)).toBe(3);
});
