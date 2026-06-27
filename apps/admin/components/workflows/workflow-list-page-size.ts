export const WORKFLOW_TABLE_HEADER_HEIGHT = 40;
export const WORKFLOW_TABLE_ROW_HEIGHT = 88;
export const WORKFLOW_TABLE_MIN_PAGE_SIZE = 1;
export const WORKFLOW_TABLE_MAX_PAGE_SIZE = 100;

export function calculateWorkflowListPageSize({
  viewportHeight,
  headerHeight = WORKFLOW_TABLE_HEADER_HEIGHT,
  rowHeight = WORKFLOW_TABLE_ROW_HEIGHT,
  scrollbarHeight = 0,
  min = WORKFLOW_TABLE_MIN_PAGE_SIZE,
  max = WORKFLOW_TABLE_MAX_PAGE_SIZE,
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

export function calculateWorkflowListRowHeight({
  viewportHeight,
  headerHeight = WORKFLOW_TABLE_HEADER_HEIGHT,
  scrollbarHeight = 0,
  pageSize,
  minRowHeight = WORKFLOW_TABLE_ROW_HEIGHT,
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
