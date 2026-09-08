import { expect, test } from 'bun:test';

const ID = '10000000-0000-4000-8000-000000000001';
const draft = { expected_version: 0, warehouse_id: ID, project_id: ID,
  items: [{ supplier_sku_id: ID, quantity: '99999999999999.9999' }] };

test('material draft contracts preserve decimals and reject client accounting fields', async () => {
  const { WarehouseIssueDraftSchema, WarehouseReturnDraftSchema } = await import('./warehouse-materials');
  expect(WarehouseIssueDraftSchema.parse(draft)).toEqual(draft);
  for (const quantity of ['0', '0.0000', '-1', '1.00001', '100000000000000', '1e2', 'NaN', 1]) {
    expect(WarehouseIssueDraftSchema.safeParse({ ...draft, items: [{ supplier_sku_id: ID, quantity }] }).success).toBe(false);
  }
  for (const field of ['unit_cost', 'amount', 'cost_category_id', 'actor_user_id', 'tenant_id']) {
    expect(WarehouseIssueDraftSchema.safeParse({ ...draft, [field]: ID }).success).toBe(false);
    expect(WarehouseIssueDraftSchema.safeParse({ ...draft, items: [{ ...draft.items[0], [field]: ID }] }).success).toBe(false);
  }
  expect(WarehouseReturnDraftSchema.parse({ expected_version: 0, original_issue_order_id: ID,
    items: [{ original_issue_item_id: ID, quantity: '0.0001' }] }).items[0]?.quantity).toBe('0.0001');
  expect(WarehouseReturnDraftSchema.safeParse({ ...draft, original_issue_order_id: ID }).success).toBe(false);
  for (const items of [[], [...draft.items, ...draft.items], Array(101).fill(draft.items[0])]) {
    expect(WarehouseIssueDraftSchema.safeParse({ ...draft, items }).success).toBe(false);
  }
  const items = Array.from({ length: 101 }, (_, index) => ({
    supplier_sku_id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`, quantity: '1',
  }));
  expect(WarehouseIssueDraftSchema.safeParse({ ...draft, items: items.slice(0, 100) }).success).toBe(true);
  expect(WarehouseIssueDraftSchema.safeParse({ ...draft, items }).success).toBe(false);
  const returned = { expected_version: 0, original_issue_order_id: ID, items: [{ original_issue_item_id: ID, quantity: '1' }] };
  expect(WarehouseReturnDraftSchema.safeParse({ ...returned, items: [...returned.items, ...returned.items] }).success).toBe(false);
  expect(WarehouseReturnDraftSchema.safeParse({ ...returned, items: [{ ...returned.items[0], cost_category_id: ID }] }).success).toBe(false);
});

test('material queries and commands enforce pagination and versions', async () => {
  const { WarehouseMaterialCommandSchema, WarehouseIssueListQuerySchema, WarehouseReturnListQuerySchema,
    WarehouseMaterialItemsQuerySchema, WarehouseMaterialProjectQuerySchema } = await import('./warehouse-materials');
  for (const schema of [WarehouseIssueListQuerySchema, WarehouseReturnListQuerySchema,
    WarehouseMaterialItemsQuerySchema, WarehouseMaterialProjectQuerySchema]) {
    expect(schema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(schema.safeParse({ pageSize: '101' }).success).toBe(false);
    expect(schema.safeParse({ page: '0' }).success).toBe(false);
    expect(schema.safeParse({ cost_category_id: ID }).success).toBe(false);
  }
  expect(WarehouseIssueListQuerySchema.parse({ status: 'submitted' }).status).toBe('submitted');
  expect(WarehouseReturnListQuerySchema.safeParse({ status: 'submitted' }).success).toBe(false);
  for (const input of [{}, { expected_version: 0 }, { expected_version: 1.5 }, { expected_version: 1, amount: '1' }]) {
    expect(WarehouseMaterialCommandSchema.safeParse(input).success).toBe(false);
  }
  expect(WarehouseMaterialCommandSchema.parse({ expected_version: 1 })).toEqual({ expected_version: 1 });
});
