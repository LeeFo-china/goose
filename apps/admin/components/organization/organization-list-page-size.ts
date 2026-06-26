export const ORGANIZATION_TABLE_HEADER_HEIGHT = 40;
export const ORGANIZATION_TABLE_ROW_HEIGHT = 112;
export const ORGANIZATION_TABLE_MIN_PAGE_SIZE = 1;
export const ORGANIZATION_TABLE_MAX_PAGE_SIZE = 100;
const ORGANIZATION_TABLE_FIT_BUFFER = 4;

export function calculateOrganizationListPageSize({
  viewportHeight,
  headerHeight = ORGANIZATION_TABLE_HEADER_HEIGHT,
  rowHeight = ORGANIZATION_TABLE_ROW_HEIGHT,
  scrollbarHeight = 0,
  min = ORGANIZATION_TABLE_MIN_PAGE_SIZE,
  max = ORGANIZATION_TABLE_MAX_PAGE_SIZE,
}: {
  viewportHeight: number;
  headerHeight?: number;
  rowHeight?: number;
  scrollbarHeight?: number;
  min?: number;
  max?: number;
}) {
  const availableHeight = Math.max(
    0,
    viewportHeight - headerHeight - scrollbarHeight - ORGANIZATION_TABLE_FIT_BUFFER,
  );
  const measured = Math.floor(availableHeight / rowHeight);
  const safeMeasured = Number.isFinite(measured) ? measured : min;

  return Math.min(max, Math.max(min, safeMeasured));
}

export function calculateOrganizationListRowHeight({
  viewportHeight,
  headerHeight = ORGANIZATION_TABLE_HEADER_HEIGHT,
  scrollbarHeight = 0,
  pageSize,
  minRowHeight = ORGANIZATION_TABLE_ROW_HEIGHT,
}: {
  viewportHeight: number;
  headerHeight?: number;
  scrollbarHeight?: number;
  pageSize: number;
  minRowHeight?: number;
}) {
  if (!Number.isFinite(pageSize) || pageSize <= 0) return minRowHeight;

  const availableHeight = Math.max(
    0,
    viewportHeight - headerHeight - scrollbarHeight - ORGANIZATION_TABLE_FIT_BUFFER,
  );
  const measured = availableHeight / pageSize;
  const safeMeasured = Number.isFinite(measured) ? measured : minRowHeight;

  return Math.max(minRowHeight, Math.floor(safeMeasured));
}
