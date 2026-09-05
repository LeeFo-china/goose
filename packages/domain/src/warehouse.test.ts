import { describe, expect, test } from 'bun:test';

import {
  PROCUREMENT_DESTINATION_TYPE_VALUES,
  WAREHOUSE_STATUS_LABELS,
  WAREHOUSE_STATUS_VALUES,
} from './warehouse';

describe('warehouse domain contract', () => {
  test('keeps stable warehouse and destination values', () => {
    expect(WAREHOUSE_STATUS_VALUES).toEqual(['active', 'inactive']);
    expect(PROCUREMENT_DESTINATION_TYPE_VALUES).toEqual([
      'project',
      'warehouse',
    ]);
    expect(WAREHOUSE_STATUS_LABELS).toEqual({
      active: '启用',
      inactive: '停用',
    });
  });
});
