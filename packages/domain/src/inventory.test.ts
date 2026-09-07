import { describe, expect, test } from 'bun:test';

import {
  INVENTORY_TRANSACTION_TYPE_LABELS,
  INVENTORY_TRANSACTION_TYPE_VALUES,
} from './inventory';

describe('inventory domain contract', () => {
  test('keeps stable inventory transaction values', () => {
    expect(INVENTORY_TRANSACTION_TYPE_VALUES).toEqual([
      'purchase_receipt',
      'project_issue',
      'project_return',
      'supplier_return',
      'adjustment_in',
      'adjustment_out',
    ]);
    expect(INVENTORY_TRANSACTION_TYPE_LABELS.purchase_receipt).toBe('采购入库');
    expect(INVENTORY_TRANSACTION_TYPE_LABELS.project_issue).toBe('项目领料');
    expect(INVENTORY_TRANSACTION_TYPE_LABELS.project_return).toBe('项目退料');
  });
});
