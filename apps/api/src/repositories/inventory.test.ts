import { describe, expect, test } from 'bun:test';

import { AppError } from '@/errors/app-error';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const WAREHOUSE_ID = '20000000-0000-4000-8000-000000000001';
const SKU_ID = '30000000-0000-4000-8000-000000000001';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

describe('InventoryRepository', () => {
  test('calls paginated inventory balance RPC', async () => {
    const { InventoryRepository } = await import('./inventory');
    const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
    const repository = new InventoryRepository({
      rpc: (name, params) => {
        calls.push({ name, params });
        return Promise.resolve({
          data: { items: [], total: 0, page: 2, page_size: 50 },
          error: null,
        });
      },
    });

    const result = await repository.listBalances({
      tenant_id: TENANT_ID,
      warehouse_id: WAREHOUSE_ID,
      keyword: '木板',
      page: 2,
      pageSize: 50,
    });

    expect(calls).toEqual([{
      name: 'list_inventory_balances',
      params: {
        p_tenant_id: TENANT_ID,
        p_warehouse_id: WAREHOUSE_ID,
        p_keyword: '木板',
        p_page: 2,
        p_page_size: 50,
      },
    }]);
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 50,
      total: 0,
      totalPages: 0,
    });
  });

  test('calls transaction RPC and wraps database errors', async () => {
    const { InventoryRepository } = await import('./inventory');
    const repository = new InventoryRepository({
      rpc: (name, params) => {
        expect(name).toBe('list_inventory_transactions');
        expect(params).toEqual({
          p_tenant_id: TENANT_ID,
          p_warehouse_id: WAREHOUSE_ID,
          p_supplier_sku_id: SKU_ID,
          p_transaction_type: 'purchase_receipt',
          p_page: 1,
          p_page_size: 20,
        });
        return Promise.resolve({ data: null, error: { message: 'boom' } });
      },
    });

    await expect(repository.listTransactions({
      tenant_id: TENANT_ID,
      warehouse_id: WAREHOUSE_ID,
      supplier_sku_id: SKU_ID,
      transaction_type: 'purchase_receipt',
      page: 1,
      pageSize: 20,
    })).rejects.toBeInstanceOf(AppError);
  });
});
