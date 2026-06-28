export const PLATFORM_LIST_TABLE_HEADER_HEIGHT = 40;
export const PLATFORM_LIST_TABLE_ROW_HEIGHT = 76;
export const PLATFORM_LIST_TABLE_MIN_PAGE_SIZE = 1;
export const PLATFORM_LIST_TABLE_MAX_PAGE_SIZE = 100;
export const PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME =
  "h-[var(--platform-list-row-height,76px)]";

export function normalizePlatformListPageSize(
  value: string | number | undefined,
  fallback = 20,
) {
  const pageSize = Number(value || fallback);
  if (!Number.isFinite(pageSize)) return fallback;

  return Math.min(
    PLATFORM_LIST_TABLE_MAX_PAGE_SIZE,
    Math.max(PLATFORM_LIST_TABLE_MIN_PAGE_SIZE, Math.floor(pageSize)),
  );
}

export function calculatePlatformListPageSize({
  viewportHeight,
  headerHeight = PLATFORM_LIST_TABLE_HEADER_HEIGHT,
  rowHeight = PLATFORM_LIST_TABLE_ROW_HEIGHT,
  scrollbarHeight = 0,
  min = PLATFORM_LIST_TABLE_MIN_PAGE_SIZE,
  max = PLATFORM_LIST_TABLE_MAX_PAGE_SIZE,
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

export function calculatePlatformListRowHeight({
  viewportHeight,
  headerHeight = PLATFORM_LIST_TABLE_HEADER_HEIGHT,
  scrollbarHeight = 0,
  pageSize,
  minRowHeight = PLATFORM_LIST_TABLE_ROW_HEIGHT,
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
