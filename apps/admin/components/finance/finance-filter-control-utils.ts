export const ALL_FILTER_VALUE = "__all";

export function normalizeFilterSelectValue(value: string | undefined): string {
  return value?.trim() || ALL_FILTER_VALUE;
}

export function filterSelectSubmitValue(value: string): string {
  return value === ALL_FILTER_VALUE ? "" : value;
}
