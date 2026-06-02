import type { ReportItem } from "./shared";

function csvEscape(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function toCsv<T extends Record<string, unknown>>(
  items: T[],
  headers: Array<keyof T & string>,
) {
  return [
    headers.join(","),
    ...items.map((item) => headers.map((header) => csvEscape(item[header])).join(",")),
  ].join("\n");
}

export function toReportCsv(items: ReportItem[]) {
  const headers = [
    "tenant_id",
    "source_table",
    "source_id",
    "source_field",
    "array_index",
    "legacy_value",
    "value_type",
    "legacy_bucket",
    "legacy_path",
    "target_object_key",
    "estimated_size_bytes",
    "status",
    "reason",
  ] as const;

  return toCsv(items, [...headers]);
}
