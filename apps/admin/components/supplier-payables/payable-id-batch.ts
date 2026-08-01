const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeSupplierPayableIds(
  input: string | readonly string[],
): string[] {
  const ids = (typeof input === "string" ? input.split(",") : input)
    .map((id) => id.trim().toLowerCase());
  if (
    ids.length < 1 ||
    ids.length > 100 ||
    ids.some((id) => !UUID_PATTERN.test(id)) ||
    new Set(ids).size !== ids.length
  ) {
    throw new RangeError("无效的应付深链：请重新选择 1 至 100 条应付");
  }
  return ids;
}
