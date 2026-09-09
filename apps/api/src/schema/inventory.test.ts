import { describe, expect, test } from 'bun:test';

import {
  InventoryBalanceListQuerySchema,
  InventoryTransactionListQuerySchema,
} from './inventory';

const WAREHOUSE_ID = '20000000-0000-4000-8000-000000000001';
const SKU_ID = '30000000-0000-4000-8000-000000000001';

describe('inventory schemas', () => {
  test.each(['transfer_out', 'transfer_in'])('accepts %s with warehouse/SKU filters and bounded pagination', (transactionType) => {
    expect(InventoryTransactionListQuerySchema.parse({
      transactionType, warehouseId: WAREHOUSE_ID, supplierSkuId: SKU_ID, page: '2', pageSize: '1',
    })).toEqual({ transactionType, warehouseId: WAREHOUSE_ID, supplierSkuId: SKU_ID, page: 2, pageSize: 1 });
    expect(InventoryTransactionListQuerySchema.safeParse({ transactionType, pageSize: 101 }).success).toBe(false);
  });

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
