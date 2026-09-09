import type { WarehouseTransferCommandResult, WarehouseTransferItem, WarehouseTransferSummary } from '@gooes/domain';

import type { InventoryBalance, InventoryPage } from '@/components/inventory/inventory-types';
import { loadBatchWarehouses } from '@/components/supplier-purchase-batches/batch-api';
import { requestBackendJson } from '@/lib/backend-client';

export type TransferPage<T> = InventoryPage<T>;
export const readTransfer = <T>(path: string, signal?: AbortSignal) => requestBackendJson<T>(path, {
  signal, cache: 'no-store', fallbackMessage: '仓库调拨数据加载失败',
});
export const loadTransferFilterWarehouses = (page: number, keyword: string, signal?: AbortSignal) =>
  loadBatchWarehouses(page, keyword, false, signal);

export async function loadTransferStock(warehouseId: string, page: number, keyword: string, signal?: AbortSignal) {
  const result = await readTransfer<TransferPage<InventoryBalance>>(
    `/inventory/balances?${new URLSearchParams({ warehouseId, page: String(page), pageSize: '20', keyword })}`, signal,
  );
  return { ...result, list: result.list.map((row) => ({
    id: row.supplier_sku_id, name: `${row.sku_name} · ${row.sku_code} · 库存 ${row.quantity_on_hand}`,
  })) };
}

export async function loadCompleteTransferItems(order: WarehouseTransferSummary, signal?: AbortSignal) {
  const result = await readTransfer<TransferPage<WarehouseTransferItem>>(
    `/warehouse-transfers/${order.id}/items?page=1&pageSize=100`, signal,
  );
  const ids = result.list.map((item) => item.id.toLowerCase());
  const skus = result.list.map((item) => item.supplier_sku_id.toLowerCase());
  const invalid = result.pagination.total > 100 || result.list.length !== result.pagination.total ||
    result.list.length !== order.item_count || new Set(ids).size !== ids.length || new Set(skus).size !== skus.length ||
    result.list.some((item) => item.transfer_order_id.toLowerCase() !== order.id.toLowerCase() ||
      item.source_warehouse_id.toLowerCase() !== order.source_warehouse_id.toLowerCase() ||
      item.destination_warehouse_id.toLowerCase() !== order.destination_warehouse_id.toLowerCase());
  return invalid ? { items: null, error: '明细不完整或身份已变化，请重新读取后编辑' } : { items: result.list, error: '' };
}

function invalidReceipt() {
  return Object.assign(new Error('操作回执不完整，结果尚未确认，请重试原请求'), {
    status: 502, code: 'WAREHOUSE_TRANSFER_RESPONSE_INVALID',
  });
}

export async function sendTransfer(path: string, body: string, key: string) {
  const result = await requestBackendJson<WarehouseTransferCommandResult | undefined>(path, {
    method: 'POST', body, headers: { 'Idempotency-Key': key }, signal: AbortSignal.timeout(30_000),
    fallbackMessage: '仓库调拨操作失败',
  });
  const action = path.split('/').at(-1);
  const receipt = action === 'save-draft' ? 'saved' : action === 'submit' ? 'submitted' :
    action === 'complete' ? 'completed' : action === 'cancel' ? 'cancelled' : null;
  const orderStatus = receipt === 'saved' ? 'draft' : receipt;
  let expectedVersion: unknown;
  try { expectedVersion = (JSON.parse(body) as { expected_version?: unknown }).expected_version; } catch { throw invalidReceipt(); }
  if (!receipt || result?.status !== receipt || typeof result.order?.id !== 'string' ||
    result.order.id.toLowerCase() !== path.split('/')[2]?.toLowerCase() || result.order.status !== orderStatus ||
    !Number.isSafeInteger(result.order.version) || typeof expectedVersion !== 'number' || result.order.version !== expectedVersion + 1)
    throw invalidReceipt();
}
