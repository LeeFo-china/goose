import { requestBackendJson } from '@/lib/backend-client';
import { buildWarehouseListPath } from '@/components/warehouses/warehouse-rules';
import type { WarehousePage } from '@/components/warehouses/warehouse-types';
import { buildInventoryPath } from './inventory-rules';
import type {
  InventoryBalance,
  InventoryPage,
  InventoryState,
  InventoryTransaction,
} from './inventory-types';

export type InventoryResult =
  | { tab: 'balances'; data: InventoryPage<InventoryBalance> }
  | { tab: 'transactions'; data: InventoryPage<InventoryTransaction> };

export async function loadInventory(
  canView: boolean,
  state: InventoryState,
  signal?: AbortSignal,
): Promise<InventoryResult | null> {
  if (!canView) return null;
  const options = {
    signal,
    cache: 'no-store' as const,
    fallbackMessage: '库存数据加载失败',
  };
  const path = buildInventoryPath(state);
  if (state.tab === 'balances') {
    return {
      tab: 'balances',
      data: await requestBackendJson<InventoryPage<InventoryBalance>>(
        path,
        options,
      ),
    };
  }
  return {
    tab: 'transactions',
    data: await requestBackendJson<InventoryPage<InventoryTransaction>>(
      path,
      options,
    ),
  };
}

export async function loadInventoryWarehouses(
  canView: boolean,
  input: { page: number; keyword: string },
  signal?: AbortSignal,
) {
  // Stock visibility does not grant warehouse-directory access. Do not request a guaranteed 403.
  if (!canView) return null;
  return requestBackendJson<WarehousePage>(
    buildWarehouseListPath({ ...input, pageSize: 20 }),
    {
      signal,
      cache: 'no-store',
      fallbackMessage: '仓库选项加载失败',
    },
  );
}
