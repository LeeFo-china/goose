export type CatalogEntryFilters = {
  keyword: string;
  modality: "all" | "text" | "image" | "video" | "speech";
  changeType: "all" | "new" | "changed" | "removed" | "unchanged";
};

export function defaultCatalogEntryFilters(): CatalogEntryFilters {
  return { keyword: "", modality: "all", changeType: "all" };
}

export function catalogFiltersEqual(left: CatalogEntryFilters, right: CatalogEntryFilters): boolean {
  return left.keyword === right.keyword
    && left.modality === right.modality
    && left.changeType === right.changeType;
}

export function shouldResetCatalogEntryPage(
  current: CatalogEntryFilters,
  next: CatalogEntryFilters,
): boolean {
  return !catalogFiltersEqual(normalizeCatalogFilters(current), normalizeCatalogFilters(next));
}

export function nextCatalogEntryPage(
  currentPage: number,
  current: CatalogEntryFilters,
  next: CatalogEntryFilters,
): number {
  return shouldResetCatalogEntryPage(current, next) ? 1 : currentPage;
}

export function buildCatalogEntriesPath(
  runId: string,
  filters: CatalogEntryFilters,
  page = 1,
): string {
  const normalized = normalizeCatalogFilters(filters);
  const params = new URLSearchParams({
    page: String(page),
    pageSize: "20",
  });
  if (normalized.keyword) params.set("keyword", normalized.keyword);
  if (normalized.modality !== "all") params.set("modality", normalized.modality);
  if (normalized.changeType !== "all") params.set("changeType", normalized.changeType);
  return `/platform/ai-config/catalog-runs/${encodeURIComponent(runId)}/entries?${params.toString()}`;
}

export function normalizeCatalogFilters(filters: CatalogEntryFilters): CatalogEntryFilters {
  return {
    keyword: filters.keyword.trim(),
    modality: filters.modality,
    changeType: filters.changeType,
  };
}
