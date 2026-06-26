export const PROJECT_TABLE_HEADER_HEIGHT = 40;
export const PROJECT_TABLE_ROW_HEIGHT = 72;
export const PROJECT_TABLE_MIN_PAGE_SIZE = 1;
export const PROJECT_TABLE_MAX_PAGE_SIZE = 100;

export function calculateProjectListPageSize({
  viewportHeight,
  headerHeight = PROJECT_TABLE_HEADER_HEIGHT,
  rowHeight = PROJECT_TABLE_ROW_HEIGHT,
  min = PROJECT_TABLE_MIN_PAGE_SIZE,
  max = PROJECT_TABLE_MAX_PAGE_SIZE,
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
