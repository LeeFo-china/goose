import { describe, expect, test } from 'bun:test';
import {
  buildInventoryPath,
  formatInventoryDecimal,
  inventoryAccess,
  inventoryReducer,
  initialInventoryState,
} from './inventory-rules';

describe('inventory read workspace rules', () => {
  test('warehouse order links require order view AND warehouse view', () => {
    expect(
      inventoryAccess(['inventory.stock.view', 'supplier.purchase-order.view'])
        .canViewPurchaseOrders,
    ).toBe(false);
    expect(
      inventoryAccess([
        'inventory.stock.view',
        'supplier.purchase-order.view',
        'inventory.warehouse.view',
      ]).canViewPurchaseOrders,
    ).toBe(true);
  });
  test('stock and warehouse/order permissions are independent', () => {
    expect(inventoryAccess(['inventory.stock.view'])).toEqual({
      canView: true,
      canViewWarehouses: false,
      canViewPurchaseOrders: false,
    });
    expect(inventoryAccess(['inventory.warehouse.view'])).toEqual({
      canView: false,
      canViewWarehouses: true,
      canViewPurchaseOrders: false,
    });
  });
  test('bounded queries send only filters supported by the selected endpoint', () => {
    expect(buildInventoryPath(initialInventoryState)).toBe(
      '/inventory/balances?page=1&pageSize=20',
    );
    const state = {
      ...initialInventoryState,
      pageSize: 500,
      keyword: ' 灯具 ',
      warehouse: { id: 'w', name: '中心仓' },
    };
    expect(buildInventoryPath(state)).toBe(
      '/inventory/balances?page=1&pageSize=100&warehouseId=w&keyword=%E7%81%AF%E5%85%B7',
    );
    expect(
      buildInventoryPath({
        ...state,
        tab: 'transactions',
        sku: { id: 'sku', name: '灯具' },
        transactionType: 'purchase_receipt',
      }),
    ).toBe(
      '/inventory/transactions?page=1&pageSize=100&warehouseId=w&supplierSkuId=sku&transactionType=purchase_receipt',
    );
  });
  test('drill, tab, search, warehouse, page size, and reset interactions reset pagination', () => {
    let state = inventoryReducer(
      { ...initialInventoryState, page: 4 },
      {
        type: 'drill',
        sku: { id: 's', name: '灯具' },
        warehouse: { id: 'w', name: '中心仓' },
      },
    );
    expect(state).toMatchObject({
      tab: 'transactions',
      page: 1,
      sku: { id: 's', name: '灯具' },
      warehouse: { id: 'w', name: '中心仓' },
    });
    state = inventoryReducer(
      { ...state, page: 3 },
      { type: 'tab', tab: 'balances' },
    );
    expect(state.sku).toBeNull();
    expect(state.warehouse?.id).toBe('w');
    expect(
      inventoryReducer(
        { ...state, page: 3 },
        { type: 'keyword', keyword: '新灯' },
      ).page,
    ).toBe(1);
    expect(
      inventoryReducer(
        { ...state, page: 3 },
        { type: 'warehouse', warehouse: null },
      ).page,
    ).toBe(1);
    expect(
      inventoryReducer(state, { type: 'pageSize', pageSize: 500 }).pageSize,
    ).toBe(100);
    expect(inventoryReducer(state, { type: 'reset' })).toEqual(
      initialInventoryState,
    );
  });
  test('decimal display preserves precision, groups digits, and uses explicit signs', () => {
    expect(formatInventoryDecimal('9999999999999999.12345678')).toBe(
      '9,999,999,999,999,999.12345678',
    );
    expect(formatInventoryDecimal('10.00000000', true)).toBe('+10');
    expect(formatInventoryDecimal('-2.30000000', true)).toBe('-2.3');
    expect(formatInventoryDecimal('0.00000000', true)).toBe('0');
  });
});
