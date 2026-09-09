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
