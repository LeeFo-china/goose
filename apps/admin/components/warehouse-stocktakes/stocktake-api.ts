import type {
  WarehouseStocktakeCommandResult,
  WarehouseStocktakeItem,
  WarehouseStocktakeOrderSummary,
} from '@gooes/domain';
import type { InventoryBalance, InventoryPage } from '@/components/inventory/inventory-types';
import { loadBatchWarehouses } from '@/components/supplier-purchase-batches/batch-api';
import { requestBackendJson } from '@/lib/backend-client';
export type StocktakePage<T> = InventoryPage<T>;
export const readStocktake = <T>(path: string, signal?: AbortSignal) =>
  requestBackendJson<T>(path, { signal, cache: 'no-store', fallbackMessage: '仓库盘点数据加载失败' });
export const loadStocktakeFilterWarehouses = (page: number, keyword: string, signal?: AbortSignal) =>
  loadBatchWarehouses(page, keyword, false, signal);
export async function loadStocktakeStock(
  warehouseId: string,
  page: number,
  keyword: string,
  signal?: AbortSignal,
) {
  const result = await readStocktake<StocktakePage<InventoryBalance>>(
    '/inventory/balances?' +
      new URLSearchParams({ warehouseId, page: String(page), pageSize: '20', keyword }),
    signal,
  );
  return {
    ...result,
    list: result.list.map((row) => ({
      id: row.supplier_sku_id,
      name: row.sku_name + ' · ' + row.sku_code + ' · 库存 ' + row.quantity_on_hand,
    })),
  };
}
export async function loadCompleteStocktakeItems(
  order: WarehouseStocktakeOrderSummary,
  signal?: AbortSignal,
) {
  const result = await readStocktake<StocktakePage<WarehouseStocktakeItem>>(
    '/warehouse-stocktakes/' + order.id + '/items?page=1&pageSize=100',
    signal,
  );
  const list = result?.list;
  const total = result?.pagination?.total;
  const same = (left: unknown, right: string) =>
    typeof left === 'string' && left.toLowerCase() === right.toLowerCase();
  const valid =
    Array.isArray(list) &&
    Number.isInteger(total) &&
    total >= 1 &&
    total <= 100 &&
    total === order.item_count &&
    list.length === total &&
    list.every(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        typeof item.supplier_sku_id === 'string' &&
        same(item.tenant_id, order.tenant_id) &&
        same(item.stocktake_order_id, order.id) &&
        same(item.warehouse_id, order.warehouse_id),
    ) &&
    new Set(list.map((item) => item.id.toLowerCase())).size === total &&
    new Set(list.map((item) => item.supplier_sku_id.toLowerCase())).size === total;
  return valid
    ? { items: list, error: '' }
    : { items: null, error: '明细不完整或身份已变化，请重新读取后编辑' };
}
function invalidReceipt() {
  return Object.assign(new Error('操作回执不完整，结果尚未确认，请重试原请求'), {
    status: 502,
    code: 'WAREHOUSE_STOCKTAKE_RESPONSE_INVALID',
  });
}
export async function sendStocktake(path: string, body: string, key: string): Promise<void> {
  const result = await requestBackendJson<WarehouseStocktakeCommandResult | null>(path, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': key },
    signal: AbortSignal.timeout(30_000),
    fallbackMessage: '仓库盘点操作失败',
  });
  const action = path.split('/').at(-1);
  const receipt =
    action === 'save-draft'
      ? 'saved'
      : action === 'start' || action === 'record-counts'
        ? 'counting'
        : action === 'submit'
          ? 'submitted'
          : action === 'complete'
            ? 'completed'
            : action === 'cancel'
              ? 'cancelled'
              : null;
  let expected: unknown;
  try {
    expected = (JSON.parse(body) as { expected_version?: unknown }).expected_version;
  } catch {
    throw invalidReceipt();
  }
  if (
    !receipt ||
    result?.status !== receipt ||
    typeof result.order?.id !== 'string' ||
    result.order.id.toLowerCase() !== path.split('/')[2]?.toLowerCase() ||
    result.order.status !== (receipt === 'saved' ? 'draft' : receipt) ||
    !Number.isSafeInteger(result.order.version) ||
    typeof expected !== 'number' ||
    !Number.isInteger(expected) ||
    result.order.version !== expected + 1
  )
    throw invalidReceipt();
}
