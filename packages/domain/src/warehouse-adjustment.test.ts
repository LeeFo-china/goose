import { expect, test } from 'bun:test';

test('warehouse adjustment states, labels, and display actions are exported', async () => {
  const domain = await import('./index');

  expect(Reflect.get(domain, 'WAREHOUSE_ADJUSTMENT_STATUS_VALUES')).toEqual([
    'draft', 'submitted', 'completed', 'cancelled',
  ]);
  expect(Reflect.get(domain, 'WAREHOUSE_ADJUSTMENT_STATUS_LABELS')).toEqual({
    draft: '草稿', submitted: '待确认', completed: '已完成', cancelled: '已取消',
  });
  expect(Reflect.get(domain, 'WAREHOUSE_ADJUSTMENT_ACTIONS')).toEqual({
    draft: ['save_draft', 'submit', 'cancel'],
    submitted: ['complete', 'cancel'],
    completed: [],
    cancelled: [],
  });
});
