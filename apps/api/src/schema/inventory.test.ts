import { describe, expect, test } from 'bun:test';

import {
  InventoryBalanceListQuerySchema,
  InventoryTransactionListQuerySchema,
} from './inventory';

const WAREHOUSE_ID = '20000000-0000-4000-8000-000000000001';
const SKU_ID = '30000000-0000-4000-8000-000000000001';

describe('inventory schemas', () => {
  test('normalizes balance list pagination and keyword', () => {
    expect(InventoryBalanceListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(InventoryBalanceListQuerySchema.parse({
      page: '2',
      pageSize: '100',
      warehouseId: WAREHOUSE_ID,
      keyword: ' 木板 ',
    })).toEqual({
      page: 2,
      pageSize: 100,
      warehouseId: WAREHOUSE_ID,
      keyword: '木板',
    });
    expect(() => InventoryBalanceListQuerySchema.parse({
      pageSize: '101',
    })).toThrow();
  });

  test('validates transaction filters', () => {
    expect(InventoryTransactionListQuerySchema.parse({
      warehouseId: WAREHOUSE_ID,
      supplierSkuId: SKU_ID,
      transactionType: 'purchase_receipt',
    })).toEqual({
      page: 1,
      pageSize: 20,
      warehouseId: WAREHOUSE_ID,
      supplierSkuId: SKU_ID,
      transactionType: 'purchase_receipt',
    });
    expect(() => InventoryTransactionListQuerySchema.parse({
      transactionType: 'unknown',
    })).toThrow();
  });
});
