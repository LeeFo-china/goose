import { z } from 'zod';
import type { WarehouseStocktakeStatus } from '@gooes/domain';
export const stocktakeUuid = z.uuid('无效的盘点 ID');
export function stocktakeFeatureEnabled(settings: unknown): boolean | null {
  if (!settings || typeof settings !== 'object' || !('warehouse_stocktakes_enabled' in settings)) return null;
  return typeof settings.warehouse_stocktakes_enabled === 'boolean'
    ? settings.warehouse_stocktakes_enabled
    : null;
}
const reason = z.string().trim().min(1, '请填写原因').max(500, '原因不能超过 500 个字符');
export function validStocktakeQuantity(value: string): boolean {
  return /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(value);
}
const quantity = z.string().refine(validStocktakeQuantity, '数量最多 14 位整数、4 位小数，且不能为负数');
const version = z.number().int().min(1).max(2147483647);
const unique = <T extends { supplier_sku_id: string }>(items: T[]) =>
  new Set(items.map((item) => item.supplier_sku_id.toLowerCase())).size === items.length;
export const stocktakeDraftSchema = z
  .object({
    expected_version: z.number().int().min(0).max(2147483647),
    warehouse_id: stocktakeUuid,
    reason,
    items: z
      .array(z.object({ supplier_sku_id: stocktakeUuid }).strict())
      .min(1)
      .max(100)
      .refine(unique, '盘点 SKU 不能重复'),
  })
  .strict();
export const stocktakeCountsSchema = z
  .object({
    expected_version: version,
    items: z
      .array(
        z
          .object({
            supplier_sku_id: stocktakeUuid,
            counted_quantity: quantity,
            difference_reason: reason.nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100)
      .refine(unique, '盘点 SKU 不能重复'),
  })
  .strict();
export const stocktakeCommandSchema = z.object({ expected_version: version }).strict();
export function stocktakeDifference(counted: string, book: string | null): string | null {
  if (book === null || !validStocktakeQuantity(book) || !validStocktakeQuantity(counted)) return null;
  const scale = BigInt(10000);
  const zero = BigInt(0);
  const units = (value: string) => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * scale + BigInt(fraction.padEnd(4, '0'));
  };
  const difference = units(counted) - units(book);
  const absolute = difference < zero ? -difference : difference;
  const fraction = (absolute % scale).toString().padStart(4, '0').replace(/0+$/, '');
  return (difference < zero ? '-' : '') + (absolute / scale).toString() + (fraction ? '.' + fraction : '');
}
export function stocktakeAccess(permissions: readonly string[]) {
  return {
    canRead: permissions.includes('inventory.stock.view'),
    canManage: permissions.includes('inventory.stocktake.manage'),
    canApprove: permissions.includes('inventory.stocktake.approve'),
    canViewWarehouses: permissions.includes('inventory.warehouse.view'),
  };
}
export type StocktakeAccess = ReturnType<typeof stocktakeAccess>;
export type StocktakeAction = 'save-draft' | 'start' | 'record-counts' | 'submit' | 'complete' | 'cancel';
export function stocktakeActions(
  status: WarehouseStocktakeStatus,
  access: StocktakeAccess,
  allCounted: boolean,
): StocktakeAction[] {
  const actions: StocktakeAction[] = [];
  if (access.canManage) {
    if (status === 'draft') actions.push('save-draft', 'start');
    if (status === 'counting') {
      actions.push('record-counts');
      if (allCounted) actions.push('submit');
    }
    if (['draft', 'counting', 'submitted'].includes(status)) actions.push('cancel');
  }
  if (access.canApprove && status === 'submitted') actions.push('complete');
  return actions;
}
export function stocktakeListPath(filters: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  warehouseId?: string;
}) {
  const finite = (value: number | undefined, fallback: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.min(max, Math.max(1, Math.floor(value)))
      : fallback;
  const query = new URLSearchParams({
    page: String(finite(filters.page, 1, Number.MAX_SAFE_INTEGER)),
    pageSize: String(finite(filters.pageSize, 20, 100)),
  });
  for (const key of ['keyword', 'status', 'warehouseId'] as const)
    if (filters[key]) query.set(key, filters[key]);
  return '/warehouse-stocktakes?' + query;
}
export function retainStocktakeCommand(error: unknown, wasUncertain: boolean): boolean {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : null;
  return (
    typeof status !== 'number' ||
    status >= 500 ||
    status === 408 ||
    status === 429 ||
    (wasUncertain && [401, 403, 404].includes(status))
  );
}
export function stocktakeError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  if (typeof code === 'string' && code.includes('SNAPSHOT_CONFLICT'))
    return '库存快照已变化，请取消本盘点单并重新建立盘点，不可强制覆盖。';
  if (typeof code === 'string' && code.includes('COST_BASIS_REQUIRED'))
    return '缺少可用成本依据，请先补齐仓库成本依据后重试；盘点不能手填成本。';
  return error instanceof Error ? error.message : '盘点操作失败，请重试';
}
