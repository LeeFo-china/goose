import { expect, test } from 'bun:test';
import {
  stocktakeFeatureEnabled,
  validStocktakeQuantity,
  stocktakeDifference,
  stocktakeListPath,
  stocktakeDraftSchema,
  stocktakeCountsSchema,
  stocktakeCommandSchema,
  stocktakeAccess,
  stocktakeActions,
  retainStocktakeCommand,
  stocktakeError,
} from './stocktake-rules';
test('开关只接受严格布尔值，缺失及畸形配置不可写', () => {
  expect(stocktakeFeatureEnabled({ warehouse_stocktakes_enabled: true })).toBe(true);
  expect(stocktakeFeatureEnabled({ warehouse_stocktakes_enabled: false })).toBe(false);
  for (const value of [
    null,
    undefined,
    {},
    { warehouse_stocktakes_enabled: 'true' },
    { warehouse_stocktakes_enabled: 1 },
  ])
    expect(stocktakeFeatureEnabled(value)).toBeNull();
});
const id = '88abcdef-0000-4000-8000-000000000101';
test('实盘零有效，空白、指数、前导零、负值和超精度无效', () => {
  for (const value of ['0', '0.0000', '99999999999999.9999'])
    expect(validStocktakeQuantity(value)).toBe(true);
  for (const value of ['', ' ', ' 0', '0 ', '-1', '01', '1e2', '100000000000000', '0.00001'])
    expect(validStocktakeQuantity(value)).toBe(false);
});
test('差异使用精确十进制，零与未录入分开', () => {
  expect(stocktakeDifference('99999999999999.9999', '99999999999999.9998')).toBe('0.0001');
  expect(stocktakeDifference('0', '99999999999999.9999')).toBe('-99999999999999.9999');
  expect(stocktakeDifference('0.0000', '0')).toBe('0');
  expect(stocktakeDifference('', '0')).toBeNull();
});
test('分页有限默认 1/20，上限 100', () => {
  expect(stocktakeListPath({ page: Infinity, pageSize: NaN })).toBe(
    '/warehouse-stocktakes?page=1&pageSize=20',
  );
  expect(stocktakeListPath({ page: -1, pageSize: 200 })).toBe('/warehouse-stocktakes?page=1&pageSize=100');
});
test('草稿白名单、UUID、原因、SKU唯一和版本边界与API一致', () => {
  const draft = { expected_version: 0, warehouse_id: id, reason: ' 原因 ', items: [{ supplier_sku_id: id }] };
  expect(stocktakeDraftSchema.parse(draft).reason).toBe('原因');
  for (const change of [
    { warehouse_id: 'bad' },
    { reason: ' ' },
    { reason: '😀'.repeat(251) },
    { expected_version: 2147483648 },
    { items: [] },
    { items: [{ supplier_sku_id: id }, { supplier_sku_id: id.toUpperCase() }] },
    { unit_cost: '1' },
  ])
    expect(stocktakeDraftSchema.safeParse({ ...draft, ...change }).success).toBe(false);
  expect(stocktakeCommandSchema.safeParse({ expected_version: 2147483647 }).success).toBe(true);
  expect(stocktakeCommandSchema.safeParse({ expected_version: 0 }).success).toBe(false);
  expect(
    stocktakeCountsSchema.safeParse({
      expected_version: 1,
      items: [{ supplier_sku_id: id, counted_quantity: '0', difference_reason: null }],
    }).success,
  ).toBe(true);
});
test('历史查看、管理与审批独立，终态只读且未全部实盘不能提交', () => {
  const access = stocktakeAccess(['inventory.stock.view', 'inventory.stocktake.manage']);
  expect(access.canRead).toBe(true);
  expect(access.canApprove).toBe(false);
  expect(stocktakeActions('counting', access, false)).toEqual(['record-counts', 'cancel']);
  expect(stocktakeActions('completed', access, true)).toEqual([]);
  expect(stocktakeActions('submitted', stocktakeAccess(['inventory.stocktake.approve']), true)).toEqual([
    'complete',
  ]);
});
test('不确定请求保留，确定冲突不自动重试；领域错误指导正确恢复', () => {
  for (const status of [408, 429, 500, 502]) expect(retainStocktakeCommand({ status }, false)).toBe(true);
  for (const status of [401, 403, 404]) expect(retainStocktakeCommand({ status }, true)).toBe(true);
  expect(retainStocktakeCommand({ status: 409 }, true)).toBe(false);
  expect(stocktakeError({ code: 'SNAPSHOT_CONFLICT' })).toContain('取消');
  expect(stocktakeError({ code: 'COST_BASIS_REQUIRED' })).toContain('成本');
});
