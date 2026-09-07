import { describe, expect, test } from 'bun:test';

import { AppError } from '@/errors/app-error';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const WAREHOUSE_ID = '20000000-0000-4000-8000-000000000001';
const SKU_ID = '30000000-0000-4000-8000-000000000001';
const TRANSACTION = {
  id: '40000000-0000-4000-8000-000000000001', tenant_id: TENANT_ID,
  warehouse_id: WAREHOUSE_ID, warehouse_name: '主仓库', supplier_sku_id: SKU_ID,
  sku_code: 'SKU-001', sku_name: '木板', transaction_type: 'purchase_receipt',
  quantity_delta: '3.0000', unit_cost: '10.0000', value_delta: '30.00',
  source_type: 'supplier_purchase_receipt_item',
  source_id: '50000000-0000-4000-8000-000000000001',
  project_id: null, cost_category_id: null, occurred_at: '2026-09-07T00:00:00Z',
  created_by_employee_id: '60000000-0000-4000-8000-000000000001',
  created_by_employee_name: '收货人', created_at: '2026-09-07T00:00:00Z',
};
const SOURCE_DOCUMENT = {
  receipt_id: '70000000-0000-4000-8000-000000000001', receipt_no: 'RK-001',
  purchase_order_id: '80000000-0000-4000-8000-000000000001', order_no: 'PO-001',
};

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

describe('InventoryRepository', () => {
  test('returns a complete source document without a second query', async () => {
    const { InventoryRepository } = await import('./inventory');
    let calls = 0;
    const repository = new InventoryRepository({ rpc: async () => {
      calls += 1;
      return { data: { items: [{ ...TRANSACTION, source_document: SOURCE_DOCUMENT }], total: 1, page: 1, page_size: 20 }, error: null };
    } });
    const result = await repository.listTransactions({ tenant_id: TENANT_ID, page: 1, pageSize: 20 });
    expect(result.list[0]).toMatchObject({ source_document: SOURCE_DOCUMENT });
    expect(calls).toBe(1);
  });

  test('normalizes older or unresolved sources to null and rejects partial links', async () => {
    const { InventoryRepository } = await import('./inventory');
    for (const source of [{}, { source_document: null }, { source_document: { receipt_id: SOURCE_DOCUMENT.receipt_id } }]) {
      const repository = new InventoryRepository({ rpc: async () => ({
        data: { items: [{ ...TRANSACTION, ...source }], total: 1, page: 1, page_size: 20 }, error: null,
      }) });
      const result = repository.listTransactions({ tenant_id: TENANT_ID, page: 1, pageSize: 20 });
      if (source.source_document) await expect(result).rejects.toBeInstanceOf(AppError);
      else expect((await result).list[0]).toMatchObject({ source_document: null });
    }
  });

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
