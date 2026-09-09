import { expect, test } from 'bun:test';
import type {
  WarehouseAdjustmentCommandInput as DomainCommandInput,
  WarehouseAdjustmentDraft,
} from '@gooes/domain';
import type {
  WarehouseAdjustmentCommandInput,
  WarehouseAdjustmentDraftInput,
  WarehouseAdjustmentListQuery,
} from './warehouse-adjustments';

const warehouse = 'abcdef00-0000-4000-8000-000000000001';
const sku = 'abcdef00-0000-4000-8000-000000000002';
const adjustmentId = 'abcdef00-0000-4000-8000-000000000003';
const item = { supplier_sku_id: sku, quantity_delta: '1.0000', adjustment_reason: '补录入库' };
const draft = { expected_version: 0, warehouse_id: warehouse, reason: '库存手工调整', items: [item] };
const forbidden = [
  'tenant_id', 'actor_user_id', 'actor_employee_id', 'project_id', 'status', 'book_quantity',
  'book_value', 'book_unit_cost', 'balance_id', 'balance_version', 'unit_cost', 'amount',
  'force', 'counted_quantity', 'quantity', 'difference_quantity', 'unexpected',
];

test('手工调整请求 schema 均有明确导出', async () => {
  const module = await import('./warehouse-adjustments');
  for (const name of [
    'WarehouseAdjustmentParamSchema', 'WarehouseAdjustmentDraftSchema',
    'WarehouseAdjustmentCommandSchema', 'WarehouseAdjustmentListQuerySchema',
    'WarehouseAdjustmentItemsQuerySchema', 'WarehouseAdjustmentSettingsQuerySchema',
  ]) {
    expect(Reflect.get(module, name)).toBeDefined();
  }
});

test('数量接受正负非零十进制字符串并保留原始精度', async () => {
  const { WarehouseAdjustmentDraftSchema: schema } = await import('./warehouse-adjustments');
  for (const magnitude of ['0.0001', '1', '1.0000', '99999999999999.9999']) {
    for (const quantity_delta of [magnitude, `-${magnitude}`]) {
      const parsed = schema.parse({ ...draft, items: [{ ...item, quantity_delta }] });
      expect(parsed.items[0]?.quantity_delta).toBe(quantity_delta);
    }
  }
  const parsed: WarehouseAdjustmentDraftInput = schema.parse(draft);
  const typed: WarehouseAdjustmentDraft = parsed;
  expect(typed).toEqual(draft);
});

test('数量拒绝零、数字类型、非规范格式及精度溢出', async () => {
  const { WarehouseAdjustmentDraftSchema: schema } = await import('./warehouse-adjustments');
  for (const quantity_delta of [
    undefined, null, -1, -0, 0, 1, NaN, Infinity, -Infinity,
    '0', '-0', '0.0', '-0.0', '0.0000', '-0.0000',
    '+1', '+0.0001', '+0', '1e2', '-1e2', '1E2', 'NaN', 'Infinity', '-Infinity',
    '01', '-01', '00.1', '-00.1', '', ' ', '\n', '.1', '-.1', '1.', '-1.',
    '1.00001', '-1.00001', '0.00001', '-0.00001', '100000000000000', '-100000000000000',
    '99999999999999.99999', '-99999999999999.99999',
    ' 1', '1 ', '-1 ', '1\n', '-1\n', '1\r\n', '1\t', '\t1', '1\u2028', '−1',
  ]) {
    expect(schema.safeParse({ ...draft, items: [{ ...item, quantity_delta }] }).success).toBe(false);
  }
  expect(schema.safeParse({ ...draft, items: [{ supplier_sku_id: sku, adjustment_reason: '补录' }] }).success).toBe(false);
});

test('草稿限制明细为 1 至 100 个唯一 SKU，允许不同 SKU 混合调增调减', async () => {
  const { WarehouseAdjustmentDraftSchema: schema } = await import('./warehouse-adjustments');
  const items = Array.from({ length: 101 }, (_, index) => ({
    ...item,
    supplier_sku_id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  }));
  for (const length of [1, 100]) {
    expect(schema.safeParse({ ...draft, items: items.slice(0, length) }).success).toBe(true);
  }
  for (const value of [undefined, null, [], items]) {
    expect(schema.safeParse({ ...draft, items: value }).success).toBe(false);
  }
  for (const supplier_sku_id of [sku, sku.toUpperCase()]) {
    expect(schema.safeParse({ ...draft, items: [item, { ...item, supplier_sku_id, quantity_delta: '-1' }] }).success).toBe(false);
  }
  expect(schema.parse({
    ...draft, items: [item, { ...item, supplier_sku_id: adjustmentId, quantity_delta: '-1.0000' }],
  }).items.map((entry) => entry.quantity_delta)).toEqual(['1.0000', '-1.0000']);
});

test('仓库和 SKU 必填且必须是 UUID', async () => {
  const { WarehouseAdjustmentDraftSchema: schema } = await import('./warehouse-adjustments');
  for (const value of [undefined, null, '', 'invalid', 1]) {
    expect(schema.safeParse({ ...draft, warehouse_id: value }).success).toBe(false);
    expect(schema.safeParse({ ...draft, items: [{ ...item, supplier_sku_id: value }] }).success).toBe(false);
  }
  const { warehouse_id, ...withoutWarehouse } = draft;
  const { supplier_sku_id, ...withoutSku } = item;
  expect(schema.safeParse(withoutWarehouse).success).toBe(false);
  expect(schema.safeParse({ ...draft, items: [withoutSku] }).success).toBe(false);
});

test('根原因和行调整原因必填、trim，并限制为 500 个 UTF-16 单元', async () => {
  const { WarehouseAdjustmentDraftSchema: schema } = await import('./warehouse-adjustments');
  for (const value of [undefined, null, 1, '', '   ', '\t\n', '字'.repeat(501), '😀'.repeat(251)]) {
    expect(schema.safeParse({ ...draft, reason: value }).success).toBe(false);
    expect(schema.safeParse({ ...draft, items: [{ ...item, adjustment_reason: value }] }).success).toBe(false);
  }
  for (const value of ['字'.repeat(500), '😀'.repeat(250)]) {
    expect(schema.parse({ ...draft, reason: value }).reason).toBe(value);
    expect(schema.parse({ ...draft, items: [{ ...item, adjustment_reason: value }] }).items[0]?.adjustment_reason).toBe(value);
  }
  const trimmed = schema.parse({ ...draft, reason: '  手工调整  ', items: [{ ...item, adjustment_reason: '  补录  ' }] });
  expect(trimmed.reason).toBe('手工调整');
  expect(trimmed.items[0]?.adjustment_reason).toBe('补录');
  const { reason, ...withoutReason } = draft;
  const { adjustment_reason, ...withoutItemReason } = item;
  expect(schema.safeParse(withoutReason).success).toBe(false);
  expect(schema.safeParse({ ...draft, items: [withoutItemReason] }).success).toBe(false);
});

test('草稿根、明细及命令严格拒绝身份、会计、状态和未知字段注入', async () => {
  const { WarehouseAdjustmentDraftSchema: schema, WarehouseAdjustmentCommandSchema: command } = await import('./warehouse-adjustments');
  for (const field of forbidden) {
    expect(schema.safeParse({ ...draft, [field]: warehouse }).success).toBe(false);
    expect(schema.safeParse({ ...draft, items: [{ ...item, [field]: warehouse }] }).success).toBe(false);
    expect(command.safeParse({ expected_version: 1, [field]: warehouse }).success).toBe(false);
  }
  expect(schema.safeParse({ ...draft, quantity_delta: '1' }).success).toBe(false);
  expect(schema.safeParse({ ...draft, items: [{ ...item, expected_version: 1 }] }).success).toBe(false);
  expect(command.safeParse({ expected_version: 1, items: [item] }).success).toBe(false);
});

test('版本只接受 int32 范围整数且仅草稿允许零', async () => {
  const { WarehouseAdjustmentDraftSchema: schema, WarehouseAdjustmentCommandSchema: command } = await import('./warehouse-adjustments');
  for (const expected_version of [undefined, null, -1, 1.5, '0', '1', 2147483648, NaN, Infinity, -Infinity]) {
    expect(schema.safeParse({ ...draft, expected_version }).success).toBe(false);
    expect(command.safeParse({ expected_version }).success).toBe(false);
  }
  const { expected_version, ...withoutVersion } = draft;
  expect(schema.safeParse(withoutVersion).success).toBe(false);
  expect(command.safeParse({}).success).toBe(false);
  expect(schema.parse(draft).expected_version).toBe(0);
  expect(command.safeParse({ expected_version: 0 }).success).toBe(false);
  for (const value of [1, 2147483647]) {
    expect(schema.parse({ ...draft, expected_version: value }).expected_version).toBe(value);
    const parsed: WarehouseAdjustmentCommandInput = command.parse({ expected_version: value });
    const typed: DomainCommandInput = parsed;
    expect(typed.expected_version).toBe(value);
  }
});

test('路径参数只接受调整 UUID', async () => {
  const { WarehouseAdjustmentParamSchema: schema } = await import('./warehouse-adjustments');
  expect(schema.parse({ id: adjustmentId })).toEqual({ id: adjustmentId });
  for (const id of [undefined, null, '', 'invalid', 1]) expect(schema.safeParse({ id }).success).toBe(false);
  expect(schema.safeParse({}).success).toBe(false);
  expect(schema.safeParse({ id: adjustmentId, tenant_id: warehouse }).success).toBe(false);
});

test('列表和明细沿用公共分页默认值、coercion 和上限', async () => {
  const schemas = await import('./warehouse-adjustments');
  for (const query of [schemas.WarehouseAdjustmentListQuerySchema, schemas.WarehouseAdjustmentItemsQuerySchema]) {
    expect(query.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(query.parse({ page: '2', pageSize: '100' })).toEqual({ page: 2, pageSize: 100 });
    for (const input of [{ page: 0 }, { page: 1.5 }, { pageSize: 0 }, { pageSize: 1.5 }, { pageSize: 101 }, { tenant_id: warehouse }]) {
      expect(query.safeParse(input).success).toBe(false);
    }
  }
});

test('列表只接受指定仓库、四种状态及长度有界的关键词过滤', async () => {
  const { WarehouseAdjustmentListQuerySchema: schema } = await import('./warehouse-adjustments');
  for (const status of ['draft', 'submitted', 'completed', 'cancelled'] as const) {
    expect(schema.parse({ status }).status).toBe(status);
  }
  const typed: WarehouseAdjustmentListQuery = schema.parse({ warehouseId: warehouse, keyword: ' 单号 ' });
  expect(typed).toEqual({ page: 1, pageSize: 20, warehouseId: warehouse, keyword: '单号' });
  expect(schema.safeParse({ keyword: '字'.repeat(100) }).success).toBe(true);
  for (const input of [
    { status: 'counting' }, { status: 'unknown' }, { warehouseId: 'invalid' }, { warehouseId: null },
    { projectId: warehouse }, { keyword: '字'.repeat(101) }, { keyword: null }, { unexpected: true },
  ]) {
    expect(schema.safeParse(input).success).toBe(false);
  }
});

test('明细仅接受分页，设置仅接受空对象', async () => {
  const { WarehouseAdjustmentItemsQuerySchema: items, WarehouseAdjustmentSettingsQuerySchema: settings } = await import('./warehouse-adjustments');
  for (const input of [{ warehouseId: warehouse }, { status: 'draft' }, { keyword: '单号' }]) {
    expect(items.safeParse(input).success).toBe(false);
  }
  expect(settings.parse({})).toEqual({});
  for (const input of [{ page: 1 }, { pageSize: 20 }, { tenant_id: warehouse }, { warehouse_adjustments_enabled: true }, { flag: true }]) {
    expect(settings.safeParse(input).success).toBe(false);
  }
});
