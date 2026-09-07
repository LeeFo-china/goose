import type { PageData, WarehouseOption } from "./batch-types";

/** Scan bounded pages: a tenant default is not necessarily on the first page. */
export async function findInitialWarehouse(
  loadPage: (page: number) => Promise<PageData<WarehouseOption>>,
  isCurrent: () => boolean,
): Promise<WarehouseOption | null> {
  let page = 1;
  while (isCurrent()) {
    const result = await loadPage(page);
    if (!isCurrent()) return null;
    if (result.pagination.total === 1) return result.list[0] ?? null;
    const preferred = result.list.find((warehouse) => warehouse.is_default);
    if (preferred) return preferred;
    if (page >= result.pagination.totalPages) return null;
    page += 1;
  }
  return null;
}
