import { expect, test } from 'bun:test';
import { ADMIN_SESSION_STORAGE_PREFIX, clearAdminSessionScopedStorage } from '@/components/layout/admin-session-scope';
import { clearStoredTransferCommand } from './transfer-command-state';
import { restoreTransferCommand, transferRecoveryStorageKey } from './transfer-command-storage';

const scope = 'tenant:tenant-a:user:user-a:employee:employee-a';
const legacyKey = `${ADMIN_SESSION_STORAGE_PREFIX}${scope}:warehouse-transfer-command`;
const id = '88abcdef-0000-4000-8000-000000000101';
const command = { path: `/warehouse-transfers/${id}/submit`, body: '{"expected_version":1}', key: 'original-key', orderId: id };

function memoryStorage(entries: [string, string][] = []) {
  const values = new Map(entries);
  return {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test('退出保留尚未迁移的旧调拨命令，其他业务会话记录仍被清理', () => {
  const otherKey = `${ADMIN_SESSION_STORAGE_PREFIX}${scope}:purchase-order-fulfillment:confirm:order`;
  const raw = JSON.stringify(command);
  const storage = memoryStorage([[legacyKey, raw], [otherKey, 'other-command']]);
  clearAdminSessionScopedStorage(storage);
  expect(storage.getItem(legacyKey)).toBe(raw);
  expect(storage.getItem(otherKey)).toBeNull();
});

test('新恢复记录退出后仍归原身份所有，确认成功才消费', () => {
  const key = transferRecoveryStorageKey(scope);
  const raw = JSON.stringify(command);
  const storage = memoryStorage([[key, raw]]);
  clearAdminSessionScopedStorage(storage);
  for (const other of [
    scope.replace('tenant-a', 'tenant-b'),
    scope.replace('user-a', 'user-b'),
    scope.replace('employee-a', 'employee-b'),
  ]) {
    expect(restoreTransferCommand(storage, other)).toEqual({ ready: true, pending: null, message: '' });
    expect(storage.getItem(key)).toBe(raw);
  }
  expect(restoreTransferCommand(storage, scope)).toEqual({ ready: true, pending: command, message: '' });
  expect(clearStoredTransferCommand(storage, key, command)).toBe('cleared');
  expect(restoreTransferCommand(storage, scope).pending).toBeNull();
});

test('旧命令仅迁移当前身份，保留body原始字节且不生成新幂等键', () => {
  const frozen = { ...command, body: '{ "expected_version": 1 }' };
  const raw = JSON.stringify(frozen);
  const otherKey = legacyKey.replace('employee-a', 'employee-b');
  const storage = memoryStorage([[legacyKey, raw], [otherKey, raw]]);
  const key = transferRecoveryStorageKey(scope);
  expect(restoreTransferCommand(storage, scope)).toEqual({ ready: true, pending: frozen, message: '' });
  expect(storage.getItem(key)).toBe(raw);
  expect(storage.getItem(legacyKey)).toBeNull();
  expect(storage.getItem(otherKey)).toBe(raw);
  expect(restoreTransferCommand(storage, scope).pending).toEqual(frozen);
});

test('相同新旧命令去重，不同命令保留双方并锁写', () => {
  const key = transferRecoveryStorageKey(scope);
  const raw = JSON.stringify(command);
  const storage = memoryStorage([[key, raw], [legacyKey, JSON.stringify(command, null, 2)]]);
  expect(restoreTransferCommand(storage, scope).pending).toEqual(command);
  expect(storage.getItem(legacyKey)).toBeNull();
  const otherRaw = JSON.stringify({ ...command, key: 'different-key' });
  storage.setItem(legacyKey, otherRaw);
  expect(restoreTransferCommand(storage, scope)).toMatchObject({ ready: false, pending: null });
  expect(storage.getItem(legacyKey)).toBe(otherRaw);
  expect(storage.getItem(key)).toBe(raw);
});

test('写入迁移副本失败或未落盘时保留旧记录并锁写', () => {
  const raw = JSON.stringify(command);
  for (const fail of ['throw', 'no-op']) {
    const storage = memoryStorage([[legacyKey, raw]]);
    storage.setItem = () => { if (fail === 'throw') throw new DOMException('Quota exceeded'); };
    expect(restoreTransferCommand(storage, scope).ready).toBe(false);
    expect(storage.getItem(legacyKey)).toBe(raw);
    expect(storage.getItem(transferRecoveryStorageKey(scope))).toBeNull();
  }
});

test('删除旧副本失败可在下次恢复时继续迁移，不丢弃已写入的原命令', () => {
  const raw = JSON.stringify(command);
  const storage = memoryStorage([[legacyKey, raw]]);
  const remove = storage.removeItem;
  storage.removeItem = () => { throw new DOMException('Storage blocked'); };
  expect(restoreTransferCommand(storage, scope).ready).toBe(false);
  expect(storage.getItem(legacyKey)).toBe(raw);
  expect(storage.getItem(transferRecoveryStorageKey(scope))).toBe(raw);
  storage.removeItem = remove;
  expect(restoreTransferCommand(storage, scope).pending).toEqual(command);
  expect(storage.getItem(legacyKey)).toBeNull();
});

test('损坏的新旧记录均锁写，不用另一个副本覆盖损坏记录', () => {
  const key = transferRecoveryStorageKey(scope);
  for (const corruptKey of [legacyKey, key]) {
    for (const raw of ['', '{broken', JSON.stringify({ ...command, path: '/other' })]) {
      const storage = memoryStorage([[key, JSON.stringify(command)], [legacyKey, JSON.stringify(command)]]);
      storage.setItem(corruptKey, raw);
      expect(restoreTransferCommand(storage, scope)).toMatchObject({ ready: false, pending: null });
      expect(storage.getItem(corruptKey)).toBe(raw);
      expect(storage.length).toBe(2);
    }
  }
});

test('不可用或不可读存储锁写，空存储允许新建', () => {
  expect(restoreTransferCommand(null, scope).ready).toBe(false);
  const storage = memoryStorage();
  expect(restoreTransferCommand(storage, scope)).toEqual({ ready: true, pending: null, message: '' });
  storage.getItem = () => { throw new DOMException('Storage blocked'); };
  expect(restoreTransferCommand(storage, scope).ready).toBe(false);
});
