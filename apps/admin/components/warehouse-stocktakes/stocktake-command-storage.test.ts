import { expect, test } from 'bun:test';
import { ADMIN_SESSION_STORAGE_PREFIX, clearAdminSessionScopedStorage } from '@/components/layout/admin-session-scope';
import { restoreStocktakeCommand, stocktakeRecoveryStorageKey } from './stocktake-command-storage';
import { clearStoredStocktakeCommand } from './stocktake-command-state';
import { STOCKTAKE_TEST_ID as id } from './stocktake-test-fixtures';
const scope = 'tenant:t:user:u:employee:e';
const legacy = `${ADMIN_SESSION_STORAGE_PREFIX}${scope}:warehouse-stocktake-command`;
const key = stocktakeRecoveryStorageKey(scope);
const command = { path: `/warehouse-stocktakes/${id}/start`, body: '{ "expected_version": 1 }', key: 'original-key', orderId: id };
const raw = JSON.stringify(command);
function memory(entries: [string, string][] = []) {
  const values = new Map(entries);
  return { get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
test('新旧前缀实际退出后同身份保留原字节与key，成功确认才消费', () => {
  for (const initialKey of [key, legacy]) {
    const storage = memory([[initialKey, raw]]);
    clearAdminSessionScopedStorage(storage);
    for (const other of ['tenant:x:user:u:employee:e', 'tenant:t:user:x:employee:e', 'tenant:t:user:u:employee:x'])
      expect(restoreStocktakeCommand(storage, other).pending).toBeNull();
    expect(storage.getItem(initialKey)).toBe(raw);
    expect(restoreStocktakeCommand(storage, scope)).toEqual({ ready: true, pending: command, message: '' });
    expect(storage.getItem(key)).toBe(raw);
    expect(storage.getItem(legacy)).toBeNull();
    expect(clearStoredStocktakeCommand(storage, key, command)).toBe('cleared');
    expect(restoreStocktakeCommand(storage, scope).pending).toBeNull();
  }
});
test('迁移写入失败、静默失败或删除失败均保留原记录', () => {
  for (const failure of ['write', 'noop', 'remove']) {
    const storage = memory([[legacy, raw]]);
    const remove = storage.removeItem;
    if (failure !== 'remove') storage.setItem = () => { if (failure === 'write') throw new Error('quota'); };
    else storage.removeItem = () => { throw new Error('blocked'); };
    expect(restoreStocktakeCommand(storage, scope).ready).toBe(false);
    expect(storage.getItem(legacy)).toBe(raw);
    if (failure === 'remove') {
      expect(storage.getItem(key)).toBe(raw); storage.removeItem = remove;
      expect(restoreStocktakeCommand(storage, scope).pending).toEqual(command);
      expect(storage.getItem(legacy)).toBeNull();
    }
  }
});
test('重复记录去重，冲突或损坏保留双方且锁写', () => {
  const storage = memory([[key, raw], [legacy, JSON.stringify(command, null, 2)]]);
  expect(restoreStocktakeCommand(storage, scope).ready).toBe(true);
  expect(storage.getItem(legacy)).toBeNull();
  for (const bad of ['', '{broken', JSON.stringify({ ...command, key: 'different' })]) {
    storage.setItem(legacy, bad);
    expect(restoreStocktakeCommand(storage, scope)).toMatchObject({ ready: false, pending: null });
    expect(storage.getItem(legacy)).toBe(bad); expect(storage.getItem(key)).toBe(raw);
  }
  storage.setItem(legacy, raw); storage.setItem(key, '{broken');
  expect(restoreStocktakeCommand(storage, scope).ready).toBe(false);
  expect(storage.getItem(legacy)).toBe(raw);
  expect(restoreStocktakeCommand(null, scope).ready).toBe(false);
});
