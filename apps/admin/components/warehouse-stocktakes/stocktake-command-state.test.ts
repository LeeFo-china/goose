import { expect, test } from 'bun:test';
import { restoreFrozenInventoryCommand } from '@/components/inventory/frozen-inventory-command';
import {
  parseStoredStocktakeCommand,
  clearStoredStocktakeCommand,
  matchStoredStocktakeCommand,
  createStocktakeCommandLifecycle,
} from './stocktake-command-state';
const id = '88abcdef-0000-4000-8000-000000000101';
const command = {
  path: '/warehouse-stocktakes/' + id + '/start',
  body: '{"expected_version":1}',
  orderId: id,
  key: 'same-key',
};

test('恢复阶段无存储或坏记录锁写，只有空存储或有效原请求可就绪', () => {
  for (const storage of [
    null,
    { getItem: () => '{broken' },
    { getItem: () => '' },
    {
      getItem: () => {
        throw new DOMException('blocked');
      },
    },
  ]) {
    expect(restoreFrozenInventoryCommand(storage, 'scope', parseStoredStocktakeCommand).ready).toBe(false);
  }
  expect(
    restoreFrozenInventoryCommand({ getItem: () => null }, 'scope', parseStoredStocktakeCommand),
  ).toEqual({ ready: true, pending: null, message: '' });
  const restored = restoreFrozenInventoryCommand(
    { getItem: () => JSON.stringify(command) },
    'scope',
    parseStoredStocktakeCommand,
  );
  expect(restored.ready).toBe(true);
  expect(restored.pending).toEqual(command);
  expect(Object.isFrozen(restored.pending)).toBe(true);
});
test('恢复冻结命令验证精确路径、UUID、版本，未知存储不可消费', () => {
  expect(parseStoredStocktakeCommand(JSON.stringify(command))).toEqual(command);
  for (const value of [
    '{broken',
    JSON.stringify({ ...command, orderId: 'other' }),
    JSON.stringify({ ...command, path: '/warehouse-transfers/' + id + '/start' }),
    JSON.stringify({ ...command, body: '{"expected_version":2147483648}' }),
  ])
    expect(parseStoredStocktakeCommand(value)).toBeNull();
});
test('旧实例或StrictMode旧owner不能删除同scope的原请求或新命令', () => {
  const lifecycle = createStocktakeCommandLifecycle();
  const old = lifecycle.activate();
  lifecycle.deactivate();
  const current = lifecycle.activate();
  const values = new Map([['scope', JSON.stringify(command)]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  expect(clearStoredStocktakeCommand(storage, 'scope', command, () => lifecycle.isCurrent(old))).toBe(
    'inactive',
  );
  expect(values.has('scope')).toBe(true);
  values.set('scope', JSON.stringify({ ...command, key: 'newer' }));
  expect(clearStoredStocktakeCommand(storage, 'scope', command, () => lifecycle.isCurrent(current))).toBe(
    'stale',
  );
  expect(matchStoredStocktakeCommand(storage, 'scope', command)).toBe('stale');
  values.set('scope', JSON.stringify(command));
  expect(clearStoredStocktakeCommand(storage, 'scope', command, () => lifecycle.isCurrent(current))).toBe(
    'cleared',
  );
});
test('存储读取失败和损坏记录保留，不自行删除', () => {
  const storage = {
    getItem: () => {
      throw new DOMException('blocked');
    },
    removeItem: () => {
      throw new DOMException('must not delete');
    },
  };
  expect(clearStoredStocktakeCommand(storage, 'scope', command)).toBe('error');
  expect(matchStoredStocktakeCommand(storage, 'scope', command)).toBe('error');
  expect(clearStoredStocktakeCommand({ ...storage, getItem: () => '{bad' }, 'scope', command)).toBe('stale');
});
