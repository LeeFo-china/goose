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
const TRANSFER_SOURCE_DOCUMENT = {
  transfer_order_id: '90000000-0000-4000-8000-000000000001', transfer_order_no: 'WT-001',
  source_warehouse_id: WAREHOUSE_ID, destination_warehouse_id: '20000000-0000-4000-8000-000000000002',
};
const STOCKTAKE_SOURCE_DOCUMENT = {
  stocktake_order_id: '91000000-0000-4000-8000-000000000001', stocktake_order_no: 'ST-001',
};

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

describe('InventoryRepository', () => {
  test.each(['adjustment_in', 'adjustment_out'] as const)('preserves complete stocktake %s source', async (transaction_type) => {
    const { InventoryRepository } = await import('./inventory');
    const repository = new InventoryRepository({ rpc: async () => ({ data: { items: [{ ...TRANSACTION,
      transaction_type, source_type: 'warehouse_stocktake_item', source_document: STOCKTAKE_SOURCE_DOCUMENT }],
      total: 1, page: 1, page_size: 20 }, error: null }) });
    expect((await repository.listTransactions({ tenant_id: TENANT_ID, page: 1, pageSize: 20 })).list[0]?.source_document)
      .toEqual(STOCKTAKE_SOURCE_DOCUMENT);
  });

  test('rejects malformed, mixed and wrong-type stocktake sources', async () => {
    const { InventoryRepository } = await import('./inventory');
    const cases = [
      ['adjustment_in', 'warehouse_stocktake_item', { stocktake_order_id: STOCKTAKE_SOURCE_DOCUMENT.stocktake_order_id }],
      ['adjustment_out', 'warehouse_stocktake_item', { ...STOCKTAKE_SOURCE_DOCUMENT, stocktake_order_no: '' }],
      ['adjustment_in', 'warehouse_stocktake_item', { ...STOCKTAKE_SOURCE_DOCUMENT, ...SOURCE_DOCUMENT }],
      ['purchase_receipt', 'warehouse_stocktake_item', STOCKTAKE_SOURCE_DOCUMENT],
      ['adjustment_in', 'legacy_adjustment', STOCKTAKE_SOURCE_DOCUMENT],
    ] as const;
    for (const [transaction_type, source_type, source_document] of cases) {
      const repository = new InventoryRepository({ rpc: async () => ({ data: { items: [{ ...TRANSACTION,
        transaction_type, source_type, source_document }], total: 1, page: 1, page_size: 20 }, error: null }) });
      await expect(repository.listTransactions({ tenant_id: TENANT_ID, page: 1, pageSize: 20 })).rejects.toBeInstanceOf(AppError);
    }
  });

  test('allows unresolved matching stocktake and legacy adjustment sources', async () => {
    const { InventoryRepository } = await import('./inventory');
    for (const [transaction_type, source_type] of [
      ['adjustment_in', 'warehouse_stocktake_item'], ['adjustment_out', 'warehouse_stocktake_item'],
      ['adjustment_in', 'legacy_adjustment'], ['adjustment_out', 'legacy_adjustment'],
    ] as const) {
      const repository = new InventoryRepository({ rpc: async () => ({ data: { items: [{ ...TRANSACTION,
        transaction_type, source_type, source_document: null }], total: 1, page: 1, page_size: 20 }, error: null }) });
      expect((await repository.listTransactions({ tenant_id: TENANT_ID, page: 1, pageSize: 20 })).list[0]?.source_document).toBeNull();
    }
  });
  test.each(['transfer_out', 'transfer_in'] as const)('preserves complete %s source with one paginated RPC', async (transactionType) => {
    const { InventoryRepository } = await import('./inventory');
    const calls: Record<string, unknown>[] = [];
    const repository = new InventoryRepository({ rpc: async (_name, params) => {
      calls.push(params);
      return { data: { items: [{ ...TRANSACTION, transaction_type: transactionType,
        source_type: `warehouse_${transactionType}_item`, source_document: TRANSFER_SOURCE_DOCUMENT }],
        total: 1, page: 1, page_size: 20 }, error: null };
    } });
    const result = await repository.listTransactions({ tenant_id: TENANT_ID, transaction_type: transactionType, page: 1, pageSize: 20 });
    expect(result.list[0]?.source_document).toEqual(TRANSFER_SOURCE_DOCUMENT);
    expect(calls).toEqual([{ p_tenant_id: TENANT_ID, p_warehouse_id: null, p_supplier_sku_id: null,
      p_transaction_type: transactionType, p_page: 1, p_page_size: 20 }]);
  });

  test('rejects incomplete, malformed, mixed or extra transfer source fields', async () => {
    const { InventoryRepository } = await import('./inventory');
    const invalid = [
      { transfer_order_id: TRANSFER_SOURCE_DOCUMENT.transfer_order_id },
      ...['transfer_order_id', 'source_warehouse_id', 'destination_warehouse_id'].map((key) => ({
        ...TRANSFER_SOURCE_DOCUMENT, [key]: 'invalid-uuid',
      })),
      { ...TRANSFER_SOURCE_DOCUMENT, transfer_order_no: '' },
      { ...TRANSFER_SOURCE_DOCUMENT, ...SOURCE_DOCUMENT },
      { ...TRANSFER_SOURCE_DOCUMENT, issue_order_id: WAREHOUSE_ID, issue_order_no: 'WI-001' },
      { ...TRANSFER_SOURCE_DOCUMENT, return_order_id: SKU_ID, return_order_no: 'WR-001' },
      { ...TRANSFER_SOURCE_DOCUMENT, extra: true },
    ];
    for (const source_document of invalid) {
      const repository = new InventoryRepository({ rpc: async () => ({ data: {
        items: [{ ...TRANSACTION, transaction_type: 'transfer_out', source_type: 'warehouse_transfer_out_item', source_document }],
        total: 1, page: 1, page_size: 20,
      }, error: null }) });
      await expect(repository.listTransactions({ tenant_id: TENANT_ID, page: 1, pageSize: 20 })).rejects.toBeInstanceOf(AppError);
    }
  });

  const issueSource = { issue_order_id: WAREHOUSE_ID, issue_order_no: 'WI-001' };
  const returnSource = { ...issueSource, return_order_id: SKU_ID, return_order_no: 'WR-001' };
  test.each(['transfer_out', 'transfer_in'] as const)('%s rejects complete legacy source shapes', async (transaction_type) => {
    const { InventoryRepository } = await import('./inventory');
    for (const source_document of [SOURCE_DOCUMENT, issueSource, returnSource]) {
      const repository = new InventoryRepository({ rpc: async () => ({ data: {
        items: [{ ...TRANSACTION, transaction_type, source_type: `warehouse_${transaction_type}_item`, source_document }],
        total: 1, page: 1, page_size: 20,
      }, error: null }) });
      await expect(repository.listTransactions({ tenant_id: TENANT_ID, page: 1, pageSize: 20 })).rejects.toBeInstanceOf(AppError);
    }
  });

  test.each(['purchase_receipt', 'project_issue', 'project_return'])('%s rejects a transfer document', async (transaction_type) => {
    const { InventoryRepository } = await import('./inventory');
    const repository = new InventoryRepository({ rpc: async () => ({ data: {
      items: [{ ...TRANSACTION, transaction_type, source_document: TRANSFER_SOURCE_DOCUMENT }], total: 1, page: 1, page_size: 20,
    }, error: null }) });
    await expect(repository.listTransactions({ tenant_id: TENANT_ID, page: 1, pageSize: 20 })).rejects.toBeInstanceOf(AppError);
  });

  test.each([
    ['transfer_out', 'warehouse_transfer_in_item'], ['transfer_in', 'warehouse_transfer_out_item'],
    ['transfer_out', 'supplier_purchase_receipt_item'], ['transfer_in', 'supplier_purchase_receipt_item'],
    ['purchase_receipt', 'warehouse_transfer_out_item'], ['purchase_receipt', 'warehouse_transfer_in_item'],
  ])('rejects mismatched %s / %s even when the document is unresolved', async (transaction_type, source_type) => {
    const { InventoryRepository } = await import('./inventory');
    for (const source_document of [TRANSFER_SOURCE_DOCUMENT, null]) {
      const repository = new InventoryRepository({ rpc: async () => ({ data: {
        items: [{ ...TRANSACTION, transaction_type, source_type, source_document }], total: 1, page: 1, page_size: 20,
      }, error: null }) });
      await expect(repository.listTransactions({ tenant_id: TENANT_ID, page: 1, pageSize: 20 })).rejects.toBeInstanceOf(AppError);
    }
  });

  test.each(['transfer_out', 'transfer_in'])('keeps matching %s unresolved sources nullable', async (transaction_type) => {
    const { InventoryRepository } = await import('./inventory');
    for (const source_document of [null, undefined]) {
      const repository = new InventoryRepository({ rpc: async () => ({ data: {
        items: [{ ...TRANSACTION, transaction_type, source_type: `warehouse_${transaction_type}_item`, source_document }],
        total: 1, page: 1, page_size: 20,
      }, error: null }) });
      expect((await repository.listTransactions({ tenant_id: TENANT_ID, page: 1, pageSize: 20 })).list[0]?.source_document).toBeNull();
    }
  });

  test('preserves issue and return source links and rejects partial or mixed sources', async () => {
    const { InventoryRepository } = await import('./inventory');
    const issue = { issue_order_id: WAREHOUSE_ID, issue_order_no: 'WI-001' };
    const returned = { ...issue, return_order_id: SKU_ID, return_order_no: 'WR-001' };
    for (const source of [issue, returned, { ...issue, receipt_id: SKU_ID }, { return_order_id: SKU_ID }]) {
      const repository = new InventoryRepository({ rpc: async () => ({
        data: { items: [{ ...TRANSACTION, source_document: source }], total: 1, page: 1, page_size: 20 }, error: null,
      }) });
      const result = repository.listTransactions({ tenant_id: TENANT_ID, page: 1, pageSize: 20 });
      if (source === issue || source === returned) expect((await result).list[0]?.source_document).toEqual(source as typeof issue | typeof returned);
      else await expect(result).rejects.toBeInstanceOf(AppError);
    }
  });
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
