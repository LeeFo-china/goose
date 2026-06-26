export const CUSTOMER_TABLE_HEADER_HEIGHT = 40;
export const CUSTOMER_TABLE_ROW_HEIGHT = 75;
export const CUSTOMER_TABLE_MIN_PAGE_SIZE = 1;
export const CUSTOMER_TABLE_MAX_PAGE_SIZE = 100;

export function calculateCustomerListPageSize({
  viewportHeight,
  headerHeight = CUSTOMER_TABLE_HEADER_HEIGHT,
  rowHeight = CUSTOMER_TABLE_ROW_HEIGHT,
  scrollbarHeight = 0,
  min = CUSTOMER_TABLE_MIN_PAGE_SIZE,
  max = CUSTOMER_TABLE_MAX_PAGE_SIZE,
}: {
  viewportHeight: number;
  headerHeight?: number;
  rowHeight?: number;
  scrollbarHeight?: number;
  min?: number;
  max?: number;
}) {
  const availableHeight = Math.max(0, viewportHeight - headerHeight - scrollbarHeight);
  const measured = Math.floor(availableHeight / rowHeight);
  const safeMeasured = Number.isFinite(measured) ? measured : min;

  return Math.min(max, Math.max(min, safeMeasured));
}

export function calculateCustomerListRowHeight({
  viewportHeight,
  headerHeight = CUSTOMER_TABLE_HEADER_HEIGHT,
  scrollbarHeight = 0,
  pageSize,
  minRowHeight = CUSTOMER_TABLE_ROW_HEIGHT,
}: {
  viewportHeight: number;
  headerHeight?: number;
  scrollbarHeight?: number;
  pageSize: number;
  minRowHeight?: number;
}) {
  if (!Number.isFinite(pageSize) || pageSize <= 0) return minRowHeight;

  const availableHeight = Math.max(0, viewportHeight - headerHeight - scrollbarHeight);
  const measured = availableHeight / pageSize;
  const safeMeasured = Number.isFinite(measured) ? measured : minRowHeight;

  return Math.max(minRowHeight, safeMeasured);
}
