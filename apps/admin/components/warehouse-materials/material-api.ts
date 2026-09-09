import type {
  WarehouseMaterialDocumentType,
  WarehouseMaterialOrder,
  WarehouseIssueItem,
  WarehouseReturnItem,
  WarehouseMaterialCommandResult,
} from '@gooes/domain';
import { requestBackendJson } from '@/lib/backend-client';
import type {
  InventoryPage,
  InventoryBalance,
} from '@/components/inventory/inventory-types';
import { materialBase } from './material-rules';

export type MaterialItem = WarehouseIssueItem | WarehouseReturnItem;
export type MaterialPage<T> = InventoryPage<T>;
export const readMaterial = <T>(path: string, signal?: AbortSignal) =>
  requestBackendJson<T>(path, {
    signal,
    cache: 'no-store',
    fallbackMessage: '领退料数据加载失败',
  });
export const loadProjects = (
  page: number,
  keyword: string,
  signal?: AbortSignal,
) =>
  readMaterial<MaterialPage<{ id: string; name: string }>>(
    `/warehouse-issues/project-options?${new URLSearchParams({ page: String(page), pageSize: '20', keyword })}`,
    signal,
  );
export async function loadStock(
  warehouseId: string,
  page: number,
  keyword: string,
  signal?: AbortSignal,
) {
  const result = await readMaterial<MaterialPage<InventoryBalance>>(
    `/inventory/balances?${new URLSearchParams({ warehouseId, page: String(page), pageSize: '20', keyword })}`,
    signal,
  );
  return {
    ...result,
    list: result.list.map((row) => ({
      id: row.supplier_sku_id,
      name: `${row.sku_name} · ${row.sku_code} · 库存 ${row.quantity_on_hand}`,
    })),
  };
}
export async function loadCompleteItems(
  kind: WarehouseMaterialDocumentType,
  order: WarehouseMaterialOrder,
  signal?: AbortSignal,
) {
  const result = await readMaterial<MaterialPage<MaterialItem>>(
    `${materialBase(kind)}/${order.id}/items?page=1&pageSize=100`,
    signal,
  );
  if (
    result.pagination.total > 100 ||
    result.list.length !== result.pagination.total ||
    result.list.length !== order.item_count ||
    new Set(result.list.map((item) => item.id)).size !== result.list.length
  ) {
    return { items: null, error: '明细不完整或已变化，请重新读取后编辑' };
  }
  return { items: result.list, error: '' };
}
export async function sendMaterial(path: string, body: string, key: string) {
  const result = await requestBackendJson<
    WarehouseMaterialCommandResult | undefined
  >(path, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': key },
    signal: AbortSignal.timeout(30_000),
    fallbackMessage: '领退料操作失败',
  });
  const action = path.split('/').at(-1);
  const expectedStatus =
    action === 'save-draft'
      ? 'saved'
      : action === 'submit'
        ? 'submitted'
        : action === 'complete'
          ? 'completed'
          : action === 'cancel'
            ? 'cancelled'
            : null;
  const orderStatus = expectedStatus === 'saved' ? 'draft' : expectedStatus;
  const expectedVersion: unknown = (
    JSON.parse(body) as { expected_version?: unknown }
  ).expected_version;
  if (
    !expectedStatus ||
    result?.status !== expectedStatus ||
    typeof result.order?.id !== 'string' ||
    result.order.id.toLowerCase() !== path.split('/')[2]?.toLowerCase() ||
    result.order.status !== orderStatus ||
    !Number.isSafeInteger(result.order.version) ||
    result.order.version <= 0 ||
    typeof expectedVersion !== 'number' ||
    result.order.version !== expectedVersion + 1
  ) {
    throw Object.assign(
      new Error('操作回执不完整，结果尚未确认，请重试原请求'),
      { status: 502, code: 'WAREHOUSE_MATERIAL_RESPONSE_INVALID' },
    );
  }
}
