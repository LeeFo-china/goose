import { expect, test } from 'bun:test';

test('warehouse transfer states, labels, and display actions are exported', async () => {
  const domain = await import('./index');

  expect(Reflect.get(domain, 'WAREHOUSE_TRANSFER_STATUS_VALUES')).toEqual([
    'draft', 'submitted', 'completed', 'cancelled',
  ]);
  expect(Reflect.get(domain, 'WAREHOUSE_TRANSFER_STATUS_LABELS')).toEqual({
    draft: '草稿', submitted: '待调拨', completed: '已调拨', cancelled: '已取消',
  });
  expect(Reflect.get(domain, 'WAREHOUSE_TRANSFER_ACTIONS')).toEqual({
    draft: ['save_draft', 'submit', 'cancel'],
    submitted: ['complete', 'cancel'],
    completed: [],
    cancelled: [],
  });
});
