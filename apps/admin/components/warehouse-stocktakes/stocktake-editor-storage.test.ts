import { expect, test } from 'bun:test';
import { createStocktakeEditorStore, type StocktakeEdit } from './stocktake-editor-storage';
import { STOCKTAKE_TEST_ID as id } from './stocktake-test-fixtures';

const edit: StocktakeEdit = { kind: 'draft', orderId: id, version: 0, warehouse: null, reason: '未保存', lines: [] };
function memory() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}
test('卸载后同身份恢复，用户租户员工均隔离', () => {
  const storage = memory();
  const scope = 'tenant:t:user:u:employee:e';
  const first = createStocktakeEditorStore(storage, scope);
  expect(first.read()).toBeNull();
  first.write(edit);
  expect(createStocktakeEditorStore(storage, scope).read()).toEqual(edit);
  for (const other of ['tenant:x:user:u:employee:e', 'tenant:t:user:x:employee:e', 'tenant:t:user:u:employee:x'])
    expect(createStocktakeEditorStore(storage, other).read()).toBeNull();
  expect([...storage.values.keys()][0]).not.toContain('admin-session');
});
test('明确放弃后不复活，旧编辑器不能覆盖或清除新记录', () => {
  const storage = memory();
  const old = createStocktakeEditorStore(storage, 's');
  old.read(); old.write(edit);
  const next = createStocktakeEditorStore(storage, 's');
  next.read(); next.write({ ...edit, reason: '新编辑' });
  expect(() => old.write(edit)).toThrow();
  expect(() => old.clear()).toThrow();
  next.clear();
  expect(createStocktakeEditorStore(storage, 's').read()).toBeNull();
});
test('保留空白、显式零及未完成小数；拒绝损坏与重复材料记录', () => {
  const storage = memory(); const store = createStocktakeEditorStore(storage, 's'); store.read();
  for (const counted of ['', '0', '1.']) {
    const counts: StocktakeEdit = { kind: 'counts', orderId: id, version: 2, lines: [{ skuId: id, counted, reason: '' }] };
    store.write(counts);
    expect(createStocktakeEditorStore(storage, 's').read()).toEqual(counts);
    expect(() => store.write({ ...counts, lines: [...counts.lines, ...counts.lines] })).toThrow();
  }
  storage.setItem([...storage.values.keys()][0]!, '{broken');
  expect(() => store.read()).toThrow();
  store.clear();
  expect(store.read()).toBeNull();
});
test('存储不可用或静默写入失败不能接收编辑', () => {
  expect(() => createStocktakeEditorStore(null, 's').read()).toThrow();
  const storage = memory(); const store = createStocktakeEditorStore({ ...storage, setItem() {} }, 's');
  store.read(); expect(() => store.write(edit)).toThrow();
  expect(storage.values.size).toBe(0);
});
