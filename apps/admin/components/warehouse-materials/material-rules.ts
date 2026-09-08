import type { WarehouseMaterialDocumentType } from '@gooes/domain';

export function materialAccess(permissions: readonly string[]) {
  const project = permissions.includes('project.read');
  return {
    canRead: project && permissions.includes('inventory.stock.view'),
    canManage: project && permissions.includes('inventory.issue.manage'),
    canApprove: project && permissions.includes('inventory.issue.approve'),
    canViewWarehouses: permissions.includes('inventory.warehouse.view'),
  };
}
export type MaterialAccess = ReturnType<typeof materialAccess>;
export type MaterialFilters = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  warehouseId?: string;
  projectId?: string;
  status?: string;
};
export function materialBase(kind: WarehouseMaterialDocumentType) {
  return kind === 'issue' ? '/warehouse-issues' : '/warehouse-returns';
}
export function materialListPath(
  kind: WarehouseMaterialDocumentType,
  filters: MaterialFilters,
) {
  const query = new URLSearchParams({
    page: String(Math.max(1, filters.page || 1)),
    pageSize: String(Math.min(100, Math.max(1, filters.pageSize || 20))),
  });
  for (const key of ['warehouseId', 'projectId', 'status', 'keyword'] as const)
    if (filters[key]) query.set(key, filters[key]);
  return `${materialBase(kind)}?${query}`;
}
export function validQuantity(value: string) {
  return (
    /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(value) && /[1-9]/.test(value)
  );
}
export function validateLines(
  lines: readonly { id: string; quantity: string }[],
) {
  if (!lines.length || lines.length > 100) return '请选择 1 至 100 条材料';
  if (new Set(lines.map((line) => line.id)).size !== lines.length)
    return '材料不可重复';
  if (lines.some((line) => !line.id || !validQuantity(line.quantity)))
    return '数量必须大于 0，最多 14 位整数和 4 位小数';
  return '';
}
export function retainCommand(error: unknown, wasUncertain: boolean) {
  const status =
    error && typeof error === 'object' && 'status' in error
      ? error.status
      : null;
  return (
    typeof status !== 'number' ||
    status >= 500 ||
    status === 408 ||
    status === 429 ||
    (wasUncertain && [401, 403, 404].includes(status))
  );
}
export function materialError(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请重试';
}
