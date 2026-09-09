export interface TransferFilters {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  sourceWarehouseId?: string;
  destinationWarehouseId?: string;
}

export function transferAccess(permissions: readonly string[]) {
  return {
    canRead: permissions.includes('inventory.stock.view'),
    canManage: permissions.includes('inventory.transfer.manage'),
    canApprove: permissions.includes('inventory.transfer.approve'),
    canViewWarehouses: permissions.includes('inventory.warehouse.view'),
  };
}
export type TransferAccess = ReturnType<typeof transferAccess>;

export function transferListPath(filters: TransferFilters) {
  const query = new URLSearchParams({
    page: String(Math.max(1, Math.floor(filters.page ?? 1))),
    pageSize: String(Math.min(100, Math.max(1, Math.floor(filters.pageSize ?? 20)))),
  });
  for (const key of ['keyword', 'status', 'sourceWarehouseId', 'destinationWarehouseId'] as const)
    if (filters[key]) query.set(key, filters[key]);
  return `/warehouse-transfers?${query}`;
}

export function validTransferQuantity(value: string) {
  return /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(value) && /[1-9]/.test(value);
}

export function validateTransferDraft(input: {
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  reason: string;
  lines: readonly { id: string; quantity: string }[];
}) {
  if (!input.reason.trim() || input.reason.trim().length > 500) return '请填写 1 至 500 个字符的调拨原因';
  if (!input.sourceWarehouseId || !input.destinationWarehouseId) return '请选择调出仓库与调入仓库';
  if (input.sourceWarehouseId.toLowerCase() === input.destinationWarehouseId.toLowerCase()) return '调出仓库与调入仓库不能相同';
  if (!input.lines.length || input.lines.length > 100) return '请选择 1 至 100 条材料';
  if (new Set(input.lines.map((line) => line.id.toLowerCase())).size !== input.lines.length) return '调拨 SKU 不能重复';
  if (input.lines.some((line) => !line.id || !validTransferQuantity(line.quantity))) return '数量必须大于 0，最多 14 位整数和 4 位小数';
  return '';
}

export function retainTransferCommand(error: unknown, wasUncertain: boolean) {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : null;
  return typeof status !== 'number' || status >= 500 || status === 408 || status === 429 ||
    (wasUncertain && [401, 403, 404].includes(status));
}

export function transferError(error: unknown) {
  return error instanceof Error ? error.message : '调拨操作失败，请重试';
}
