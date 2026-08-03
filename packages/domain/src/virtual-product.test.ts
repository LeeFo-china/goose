import { describe, expect, test } from 'bun:test';

import {
  VIRTUAL_BENEFIT_TYPES,
  VIRTUAL_GOODS_OPERATION_STATES,
  VIRTUAL_PRODUCT_STATUSES,
} from './virtual-product';

describe('virtual product contract', () => {
  test('freezes supported benefit and lifecycle values', () => {
    expect(VIRTUAL_BENEFIT_TYPES).toEqual([
      'duration',
      'count',
      'points',
      'quota',
    ]);
    expect(VIRTUAL_PRODUCT_STATUSES).toEqual([
      'draft',
      'active',
      'suspended',
      'archived',
    ]);
    expect(VIRTUAL_GOODS_OPERATION_STATES).toEqual([
      'submitted',
      'processing',
      'succeeded',
      'failed',
      'unknown',
    ]);
  });
});
