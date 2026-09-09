import { expect, test } from 'bun:test';
import type { WarehouseTransferCommandInput, WarehouseTransferDraft } from '@gooes/domain';

const source = 'abcdef00-0000-4000-8000-000000000001';
const destination = 'abcdef00-0000-4000-8000-000000000002';
const sku = 'abcdef00-0000-4000-8000-000000000003';
const draft = {
  expected_version: 0, source_warehouse_id: source, destination_warehouse_id: destination,
  reason: '开发调拨', items: [{ supplier_sku_id: sku, quantity: '0.0001' }],
};

test('调拨草稿保留精度并拒绝同仓、重复 SKU 和客户端会计字段', async () => {
  const schema = await import('./warehouse-transfers');
  expect(schema.WarehouseTransferDraftSchema).toBeDefined();
  const parse = (value: unknown) => schema.WarehouseTransferDraftSchema.safeParse(value);
  expect(parse(draft).success).toBe(true);
  for (const value of [source, source.toUpperCase()]) {
    expect(parse({ ...draft, destination_warehouse_id: value }).success).toBe(false);
  }
  expect(parse({ ...draft, items: [draft.items[0], { supplier_sku_id: sku.toUpperCase(), quantity: '1' }] }).success).toBe(false);
  for (const quantity of ['0', '0.0000', '-1', '1.00001', '100000000000000', '1e2', 'NaN', '01', ' 1', 1]) {
    expect(parse({ ...draft, items: [{ supplier_sku_id: sku, quantity }] }).success).toBe(false);
  }
  const maximum = '99999999999999.9999';
  expect(schema.WarehouseTransferDraftSchema.parse({
    ...draft, items: [{ supplier_sku_id: sku, quantity: maximum }],
  }).items[0]?.quantity).toBe(maximum);
  for (const field of ['unit_cost', 'amount', 'cost_category_id', 'project_id', 'tenant_id', 'actor_user_id', 'status']) {
    expect(parse({ ...draft, [field]: source }).success).toBe(false);
    expect(parse({ ...draft, items: [{ ...draft.items[0], [field]: source }] }).success).toBe(false);
  }
  const items = Array.from({ length: 101 }, (_, index) => ({
    supplier_sku_id: '10000000-0000-4000-8000-' + String(index).padStart(12, '0'), quantity: '1',
  }));
  expect(parse({ ...draft, items: [] }).success).toBe(false);
  expect(parse({ ...draft, items: items.slice(0, 100) }).success).toBe(true);
  expect(parse({ ...draft, items }).success).toBe(false);
  for (const reason of [undefined, null, '', '   ', '字'.repeat(501)]) {
    expect(parse({ ...draft, reason }).success).toBe(false);
  }
  expect(schema.WarehouseTransferDraftSchema.parse({ ...draft, reason: '  调拨  ' }).reason).toBe('调拨');
  expect(parse({ ...draft, reason: '字'.repeat(500) }).success).toBe(true);
});

test('调拨版本、分页、参数和状态过滤有界且严格', async () => {
  const schema = await import('./warehouse-transfers');
  expect(schema.WarehouseTransferCommandSchema).toBeDefined();
  for (const value of [-1, 1.5, '1', 2147483648]) {
    expect(schema.WarehouseTransferDraftSchema.safeParse({ ...draft, expected_version: value }).success).toBe(false);
    expect(schema.WarehouseTransferCommandSchema.safeParse({ expected_version: value }).success).toBe(false);
  }
  expect(schema.WarehouseTransferCommandSchema.safeParse({ expected_version: 0 }).success).toBe(false);
  expect(schema.WarehouseTransferCommandSchema.safeParse({}).success).toBe(false);
  expect(schema.WarehouseTransferDraftSchema.safeParse({ ...draft, expected_version: undefined }).success).toBe(false);
  const typedDraft: WarehouseTransferDraft = schema.WarehouseTransferDraftSchema.parse({ ...draft, expected_version: 2147483647 });
  const typedCommand: WarehouseTransferCommandInput = schema.WarehouseTransferCommandSchema.parse({ expected_version: 1 });
  expect(typedDraft.expected_version).toBe(2147483647);
  expect(typedCommand.expected_version).toBe(1);
  expect(schema.WarehouseTransferCommandSchema.parse({ expected_version: 2147483647 }).expected_version).toBe(2147483647);
  expect(schema.WarehouseTransferCommandSchema.safeParse({ expected_version: 1, tenant_id: source }).success).toBe(false);
  expect(schema.WarehouseTransferParamSchema.parse({ id: source }).id).toBe(source);
  expect(schema.WarehouseTransferParamSchema.safeParse({ id: 'invalid' }).success).toBe(false);
  expect(schema.WarehouseTransferParamSchema.safeParse({ id: source, tenant_id: source }).success).toBe(false);
  for (const query of [schema.WarehouseTransferListQuerySchema, schema.WarehouseTransferItemsQuerySchema]) {
    expect(query.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(query.parse({ page: '2', pageSize: '100' })).toEqual({ page: 2, pageSize: 100 });
    for (const input of [{ page: 0 }, { pageSize: 101 }, { pageSize: 0 }, { tenant_id: source }]) {
      expect(query.safeParse(input).success).toBe(false);
    }
  }
  expect(schema.WarehouseTransferListQuerySchema.parse({
    sourceWarehouseId: source, destinationWarehouseId: destination, status: 'submitted', keyword: ' 单号 ',
  }).keyword).toBe('单号');
  for (const input of [{ status: 'in_transit' }, { projectId: source }, { keyword: '字'.repeat(101) }, { sourceWarehouseId: 'invalid' }]) {
    expect(schema.WarehouseTransferListQuerySchema.safeParse(input).success).toBe(false);
  }
  expect(schema.WarehouseTransferItemsQuerySchema.safeParse({ sourceWarehouseId: source }).success).toBe(false);
});
