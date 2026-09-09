import { expect, test } from 'bun:test';

import { clearStoredTransferCommand, createTransferCommandLifecycle, parseStoredTransferCommand } from './transfer-command-state';

test('只恢复路径、身份和body一致的冻结调拨命令', () => {
  const id = '88abcdef-0000-4000-8000-000000000101';
  const valid = { path: `/warehouse-transfers/${id}/submit`, body: '{"expected_version":1}', key: 'key', orderId: id };
  expect(parseStoredTransferCommand(JSON.stringify(valid))).toEqual(valid);
  expect(parseStoredTransferCommand(JSON.stringify({ ...valid, orderId: 'other' }))).toBeNull();
  expect(parseStoredTransferCommand(JSON.stringify({ ...valid, path: '/warehouse-transfers/bad/submit' }))).toBeNull();
  expect(parseStoredTransferCommand('{broken')).toBeNull();
});

test('旧请求响应不能删除同一会话中新冻结的命令', () => {
  const id = '88abcdef-0000-4000-8000-000000000101';
  const first = { path: `/warehouse-transfers/${id}/submit`, body: '{"expected_version":1}', key: 'first', orderId: id };
  const second = { ...first, body: '{"expected_version":2}', key: 'second' };
  const values = new Map([['scope', JSON.stringify(second)]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); },
  };
  expect(clearStoredTransferCommand(storage, 'scope', first)).toBe('stale');
  expect(values.get('scope')).toBe(JSON.stringify(second));
  expect(clearStoredTransferCommand(storage, 'scope', second)).toBe('cleared');
  expect(values.has('scope')).toBe(false);
});

test('清理冻结命令存储失败时安全保留并报告', () => {
  const id = '88abcdef-0000-4000-8000-000000000101';
  const command = { path: `/warehouse-transfers/${id}/submit`, body: '{"expected_version":1}', key: 'key', orderId: id };
  const storage = { getItem: () => { throw new DOMException('blocked'); }, removeItem: () => {} };
  expect(clearStoredTransferCommand(storage, 'scope', command)).toBe('error');
});

test('卸载的旧实例不能消费当前实例正在重试的同一冻结命令', () => {
  const id = '88abcdef-0000-4000-8000-000000000101';
  const command = { path: `/warehouse-transfers/${id}/submit`, body: '{"expected_version":1}', key: 'same', orderId: id };
  const values = new Map([['scope', JSON.stringify(command)]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => { values.delete(key); } };
  const lifecycle = createTransferCommandLifecycle();
  const oldOwner = lifecycle.activate();
  lifecycle.deactivate();
  const currentOwner = lifecycle.activate();

  expect(clearStoredTransferCommand(storage, 'scope', command, () => lifecycle.isCurrent(oldOwner))).toBe('inactive');
  expect(values.has('scope')).toBe(true);
  expect(clearStoredTransferCommand(storage, 'scope', command, () => lifecycle.isCurrent(currentOwner))).toBe('cleared');
  expect(values.has('scope')).toBe(false);
});
