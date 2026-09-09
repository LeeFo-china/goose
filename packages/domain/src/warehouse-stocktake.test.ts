import { expect, test } from 'bun:test';

test('warehouse stocktake states, labels, and display actions are exported', async () => {
  const domain = await import('./index');

  expect(Reflect.get(domain, 'WAREHOUSE_STOCKTAKE_STATUS_VALUES')).toEqual([
    'draft', 'counting', 'submitted', 'completed', 'cancelled',
  ]);
  expect(Reflect.get(domain, 'WAREHOUSE_STOCKTAKE_STATUS_LABELS')).toEqual({
    draft: '草稿', counting: '盘点中', submitted: '待确认', completed: '已完成', cancelled: '已取消',
  });
  expect(Reflect.get(domain, 'WAREHOUSE_STOCKTAKE_ACTIONS')).toEqual({
    draft: ['save_draft', 'start', 'cancel'],
    counting: ['record_counts', 'submit', 'cancel'],
    submitted: ['complete', 'cancel'],
    completed: [],
    cancelled: [],
  });
});

test('warehouse stocktake response contracts accept the real read-model shape', async () => {
  const order: import('./warehouse-stocktake').WarehouseStocktakeOrder = {
    id: 'id', tenant_id: 'tenant', warehouse_id: 'warehouse', order_no: 'WS-1', status: 'counting', version: 1,
    reason: '盘点', created_by_employee_id: 'employee', updated_by_employee_id: 'employee', created_at: 'now',
    updated_at: 'now', started_at: 'now', submitted_at: null, completed_at: null, cancelled_at: null,
  };
  const result: import('./warehouse-stocktake').WarehouseStocktakeCommandResult = { status: 'counting', order };
  const summary = { ...order, warehouse_name: '主仓', item_count: 1, counted_count: 1, difference_count: 0,
    gain_amount: null, loss_amount: null } satisfies import('./warehouse-stocktake').WarehouseStocktakeOrderSummary;
  const settings = { warehouse_stocktakes_enabled: true } satisfies import('./warehouse-stocktake').WarehouseStocktakeSettings;
  expect(result.order.started_at).toBe('now');
  expect(summary.item_count).toBe(1);
  expect(settings.warehouse_stocktakes_enabled).toBe(true);
});
