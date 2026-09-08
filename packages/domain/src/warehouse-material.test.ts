import { expect, test } from 'bun:test';

test('material states and actions distinguish issue submission from direct return completion', async () => {
  const domain = await import('./warehouse-material');
  expect(domain.WAREHOUSE_ISSUE_STATUS_VALUES).toEqual(['draft', 'submitted', 'completed', 'cancelled']);
  expect(domain.WAREHOUSE_RETURN_STATUS_VALUES).toEqual(['draft', 'completed', 'cancelled']);
  expect(domain.WAREHOUSE_ISSUE_STATUS_LABELS.submitted).toBe('待出库');
  expect(domain.WAREHOUSE_RETURN_STATUS_LABELS.completed).toBe('已退料');
  expect(domain.WAREHOUSE_ISSUE_ACTIONS.draft).toEqual(['save_draft', 'submit', 'cancel']);
  expect(domain.WAREHOUSE_ISSUE_ACTIONS.submitted).toEqual(['complete', 'cancel']);
  expect(domain.WAREHOUSE_RETURN_ACTIONS.draft).toEqual(['save_draft', 'complete', 'cancel']);
  expect(domain.WAREHOUSE_ISSUE_ACTIONS.completed).toEqual([]);
});
