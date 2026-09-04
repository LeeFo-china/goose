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

export function shouldLoadCatalogEntriesOnMount(input: {
  selectedRunId: string;
  loadedRunId?: string;
  firstEntryRunId?: string;
  filters: CatalogEntryFilters;
}): boolean {
  if (!input.selectedRunId) return false;
  const filters = normalizeCatalogFilters(input.filters);
  const loadedRunId = input.loadedRunId ?? input.firstEntryRunId;
  return loadedRunId !== input.selectedRunId
    || filters.keyword !== ""
    || filters.modality !== "all"
    || filters.changeType !== "all";
}

export function filterApplicableCatalogEntryIds(
  selectedIds: string[],
  entries: Array<{ id: string; apply_status?: string | null }>,
): string[] {
  const applicableIds = new Set(
    entries
      .filter((entry) => entry.apply_status !== "blocked")
      .map((entry) => entry.id),
  );
  return selectedIds.filter((id) => applicableIds.has(id)).slice(0, 100);
}

export function nextCatalogRunSelection(
  currentRunId: string,
  nextRunId: string,
  currentPage: number,
): { page: number; sameRun: boolean } {
  const sameRun = currentRunId === nextRunId;
  return { page: sameRun ? currentPage : 1, sameRun };
}
