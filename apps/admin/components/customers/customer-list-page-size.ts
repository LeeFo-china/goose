export const CUSTOMER_TABLE_HEADER_HEIGHT = 40;
export const CUSTOMER_TABLE_ROW_HEIGHT = 75;
export const CUSTOMER_TABLE_MIN_PAGE_SIZE = 1;
export const CUSTOMER_TABLE_MAX_PAGE_SIZE = 100;

export function calculateCustomerListPageSize({
  viewportHeight,
  headerHeight = CUSTOMER_TABLE_HEADER_HEIGHT,
  rowHeight = CUSTOMER_TABLE_ROW_HEIGHT,
  min = CUSTOMER_TABLE_MIN_PAGE_SIZE,
  max = CUSTOMER_TABLE_MAX_PAGE_SIZE,
}: {
  viewportHeight: number;
  headerHeight?: number;
  rowHeight?: number;
  min?: number;
  max?: number;
}) {
  const availableHeight = Math.max(0, viewportHeight - headerHeight);
  const measured = Math.floor(availableHeight / rowHeight);
  const safeMeasured = Number.isFinite(measured) ? measured : min;

  return Math.min(max, Math.max(min, safeMeasured));
}
