import { expect, test } from 'bun:test';
import type {
  WarehouseStocktakeCommandInput as DomainCommandInput,
  WarehouseStocktakeCountsInput as DomainCountsInput,
  WarehouseStocktakeDraft,
} from '@gooes/domain';

const warehouse = 'abcdef00-0000-4000-8000-000000000001';
const sku = 'abcdef00-0000-4000-8000-000000000002';
const stocktakeId = 'abcdef00-0000-4000-8000-000000000003';
const draft = { expected_version: 0, warehouse_id: warehouse, reason: '月末盘点', items: [{ supplier_sku_id: sku }] };
const counts = { expected_version: 1, items: [{ supplier_sku_id: sku, counted_quantity: '1' }] };
const forbidden = [
  'tenant_id', 'actor_user_id', 'project_id', 'status', 'book_quantity', 'book_inventory_value',
  'book_unit_cost', 'balance_id', 'balance_version', 'difference_quantity', 'unit_cost', 'amount',
  'force', 'unexpected',
];

test('盘点请求 schema 均有明确导出', async () => {
  const module = await import('./warehouse-stocktakes');
  for (const name of [
    'WarehouseStocktakeParamSchema', 'WarehouseStocktakeDraftSchema',
    'WarehouseStocktakeCountsSchema', 'WarehouseStocktakeCommandSchema',
    'WarehouseStocktakeListQuerySchema', 'WarehouseStocktakeItemsQuerySchema',
    'WarehouseStocktakeSettingsQuerySchema',
  ]) {
    expect(Reflect.get(module, name)).toBeDefined();
  }
});

test('盘点草稿限制仓库、原因、SKU、数量和注入字段', async () => {
  const { WarehouseStocktakeDraftSchema: schema } = await import('./warehouse-stocktakes');
  const parse = (value: unknown) => schema.safeParse(value);
  const typed: WarehouseStocktakeDraft = schema.parse(draft);
  expect(typed).toEqual(draft);

  for (const warehouse_id of [undefined, null, 'invalid']) expect(parse({ ...draft, warehouse_id }).success).toBe(false);
  for (const supplier_sku_id of [undefined, null, 'invalid']) {
    expect(parse({ ...draft, items: [{ supplier_sku_id }] }).success).toBe(false);
  }
  for (const reason of [undefined, null, '', '   ', '字'.repeat(501)]) {
    expect(parse({ ...draft, reason }).success).toBe(false);
  }
  expect(schema.parse({ ...draft, reason: '  月末盘点  ' }).reason).toBe('月末盘点');
  expect(parse({ ...draft, reason: '字'.repeat(500) }).success).toBe(true);

  const items = Array.from({ length: 101 }, (_, index) => ({
    supplier_sku_id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  }));
  expect(parse({ ...draft, items: [] }).success).toBe(false);
  expect(parse({ ...draft, items: items.slice(0, 1) }).success).toBe(true);
  expect(parse({ ...draft, items: items.slice(0, 100) }).success).toBe(true);
  expect(parse({ ...draft, items }).success).toBe(false);
  expect(parse({ ...draft, items: [draft.items[0], { supplier_sku_id: sku.toUpperCase() }] }).success).toBe(false);
  expect(parse({ ...draft, items: [{ ...draft.items[0], counted_quantity: '1' }] }).success).toBe(false);
  for (const field of forbidden) {
    expect(parse({ ...draft, [field]: warehouse }).success).toBe(false);
    expect(parse({ ...draft, items: [{ ...draft.items[0], [field]: warehouse }] }).success).toBe(false);
  }
});

test('盘点数量保留精度并严格区分缺失与零', async () => {
  const { WarehouseStocktakeCountsSchema: schema } = await import('./warehouse-stocktakes');
  const parse = (value: unknown) => schema.safeParse(value);
  for (const counted_quantity of ['0', '0.0000', '0.0001', '1', '1.0000', '99999999999999.9999']) {
    const parsed = schema.parse({ ...counts, items: [{ supplier_sku_id: sku, counted_quantity }] });
    expect(parsed.items[0]?.counted_quantity).toBe(counted_quantity);
  }
  for (const counted_quantity of [
    undefined, null, -1, 0, 1, '-1', '-0', '1e2', 'NaN', 'Infinity', '01', '', ' ', '\n',
    '.1', '1.', '1.00001', '100000000000000', '1\n', ' 1', '1 ',
  ]) {
    expect(parse({ ...counts, items: [{ supplier_sku_id: sku, counted_quantity }] }).success).toBe(false);
  }
  const typed: DomainCountsInput = schema.parse(counts);
  expect(typed.items[0]?.counted_quantity).toBe('1');

  const items = Array.from({ length: 101 }, (_, index) => ({
    supplier_sku_id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    counted_quantity: '0',
  }));
  expect(parse({ ...counts, items: [] }).success).toBe(false);
  expect(parse({ ...counts, items: items.slice(0, 1) }).success).toBe(true);
  expect(parse({ ...counts, items: items.slice(0, 100) }).success).toBe(true);
  expect(parse({ ...counts, items }).success).toBe(false);
  expect(parse({ ...counts, items: [counts.items[0], { ...counts.items[0], supplier_sku_id: sku.toUpperCase() }] }).success).toBe(false);
  for (const supplier_sku_id of [undefined, null, 'invalid']) {
    expect(parse({ ...counts, items: [{ supplier_sku_id, counted_quantity: '0' }] }).success).toBe(false);
  }
  expect(parse({ ...counts, warehouse_id: warehouse }).success).toBe(false);
  for (const field of forbidden) {
    expect(parse({ ...counts, [field]: warehouse }).success).toBe(false);
    expect(parse({ ...counts, items: [{ ...counts.items[0], [field]: warehouse }] }).success).toBe(false);
  }
});

test('差异原因允许缺省或 null，提供时会去空格并限制长度', async () => {
  const { WarehouseStocktakeCountsSchema: schema } = await import('./warehouse-stocktakes');
  const make = (difference_reason?: unknown) => ({
    ...counts,
    items: [{ ...counts.items[0], ...(difference_reason === undefined ? {} : { difference_reason }) }],
  });
  expect(schema.parse(make()).items[0]).not.toHaveProperty('difference_reason');
  expect(schema.parse(make(null)).items[0]?.difference_reason).toBeNull();
  expect(schema.parse(make('  破损  ')).items[0]?.difference_reason).toBe('破损');
  expect(schema.safeParse(make('字'.repeat(500))).success).toBe(true);
  for (const reason of ['', '   ', 1, '字'.repeat(501)]) expect(schema.safeParse(make(reason)).success).toBe(false);
});

test('版本号、参数和命令严格且有界', async () => {
  const schema = await import('./warehouse-stocktakes');
  for (const value of [undefined, null, -1, 1.5, '1', 2147483648]) {
    expect(schema.WarehouseStocktakeDraftSchema.safeParse({ ...draft, expected_version: value }).success).toBe(false);
    expect(schema.WarehouseStocktakeCountsSchema.safeParse({ ...counts, expected_version: value }).success).toBe(false);
    expect(schema.WarehouseStocktakeCommandSchema.safeParse({ expected_version: value }).success).toBe(false);
  }
  expect(schema.WarehouseStocktakeDraftSchema.parse({ ...draft, expected_version: 0 }).expected_version).toBe(0);
  for (const value of [1, 2147483647]) {
    expect(schema.WarehouseStocktakeDraftSchema.parse({ ...draft, expected_version: value }).expected_version).toBe(value);
    expect(schema.WarehouseStocktakeCountsSchema.parse({ ...counts, expected_version: value }).expected_version).toBe(value);
    const typed: DomainCommandInput = schema.WarehouseStocktakeCommandSchema.parse({ expected_version: value });
    expect(typed.expected_version).toBe(value);
  }
  expect(schema.WarehouseStocktakeCountsSchema.safeParse({ ...counts, expected_version: 0 }).success).toBe(false);
  expect(schema.WarehouseStocktakeCommandSchema.safeParse({ expected_version: 0 }).success).toBe(false);
  for (const field of forbidden) {
    expect(schema.WarehouseStocktakeCommandSchema.safeParse({ expected_version: 1, [field]: warehouse }).success).toBe(false);
  }
  expect(schema.WarehouseStocktakeParamSchema.parse({ id: stocktakeId }).id).toBe(stocktakeId);
  for (const id of [undefined, null, 'invalid']) expect(schema.WarehouseStocktakeParamSchema.safeParse({ id }).success).toBe(false);
  expect(schema.WarehouseStocktakeParamSchema.safeParse({ id: stocktakeId, tenant_id: warehouse }).success).toBe(false);
});

test('列表、明细和设置查询只接受各自白名单字段', async () => {
  const schema = await import('./warehouse-stocktakes');
  for (const query of [schema.WarehouseStocktakeListQuerySchema, schema.WarehouseStocktakeItemsQuerySchema]) {
    expect(query.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(query.parse({ page: '2', pageSize: '100' })).toEqual({ page: 2, pageSize: 100 });
    for (const input of [{ page: 0 }, { page: 1.5 }, { pageSize: 0 }, { pageSize: 101 }, { tenant_id: warehouse }]) {
      expect(query.safeParse(input).success).toBe(false);
    }
  }
  for (const status of ['draft', 'counting', 'submitted', 'completed', 'cancelled'] as const) {
    expect(schema.WarehouseStocktakeListQuerySchema.parse({ status }).status).toBe(status);
  }
  expect(schema.WarehouseStocktakeListQuerySchema.parse({ warehouseId: warehouse, keyword: ' 单号 ' })).toMatchObject({
    warehouseId: warehouse, keyword: '单号',
  });
  expect(schema.WarehouseStocktakeListQuerySchema.safeParse({ keyword: '字'.repeat(100) }).success).toBe(true);
  for (const input of [{ status: 'unknown' }, { warehouseId: 'invalid' }, { projectId: warehouse }, { keyword: '字'.repeat(101) }]) {
    expect(schema.WarehouseStocktakeListQuerySchema.safeParse(input).success).toBe(false);
  }
  for (const input of [{ warehouseId: warehouse }, { status: 'draft' }, { keyword: '单号' }]) {
    expect(schema.WarehouseStocktakeItemsQuerySchema.safeParse(input).success).toBe(false);
  }
  expect(schema.WarehouseStocktakeSettingsQuerySchema.parse({})).toEqual({});
  expect(schema.WarehouseStocktakeSettingsQuerySchema.safeParse({ tenant_id: warehouse }).success).toBe(false);
  expect(schema.WarehouseStocktakeSettingsQuerySchema.safeParse({ page: 1 }).success).toBe(false);
});
