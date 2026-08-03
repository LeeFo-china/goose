export type CaseFilterState = {
  selectedStyle: string;
  selectedLayout: string;
};

export type CaseFilterKind = "style" | "layout";

export function toggleCaseFilter(
  current: CaseFilterState,
  kind: CaseFilterKind,
  value: string,
): CaseFilterState {
  if (kind === "style") {
    return {
      ...current,
      selectedStyle: current.selectedStyle === value ? "" : value,
    };
  }
  return {
    ...current,
    selectedLayout: current.selectedLayout === value ? "" : value,
  };
}

export function clearCaseFilters(): CaseFilterState {
  return { selectedStyle: "", selectedLayout: "" };
}

export function hasActiveCaseFilters(filters: CaseFilterState): boolean {
  return Boolean(filters.selectedStyle || filters.selectedLayout);
}
