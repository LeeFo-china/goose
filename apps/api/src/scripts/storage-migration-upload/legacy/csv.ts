import type { DryRunItem, MigrationResult } from "./types";

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === "\"" && next === "\"") {
        value += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === "\"") {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(value);
      value = "";
      continue;
    }
    if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }
    if (char !== "\r") {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

export function readDryRunItems(csvText: string) {
  const rows = parseCsv(csvText);
  const headers = rows.shift() || [];
  return rows
    .filter((row) => row.some((value) => value.trim()))
    .map((row) => Object.fromEntries(
      headers.map((header, index) => [header, row[index] || ""]),
    ) as DryRunItem);
}

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

export function toCsv(items: MigrationResult[]) {
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
    "migrated_status",
    "file_id",
    "provider",
    "bucket",
    "region",
    "object_key",
    "public_url",
    "mime_type",
    "size_bytes",
    "checksum",
    "access_url_http_status",
    "migrated_reason",
  ] as const;

  return [
    headers.join(","),
    ...items.map((item) => headers.map((header) => csvEscape(item[header])).join(",")),
  ].join("\n");
}
