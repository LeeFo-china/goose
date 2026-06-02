import type { MigrationItem, VerifyResult } from "./types";

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
    if (char !== "\r") value += char;
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

export function readItems(text: string) {
  const rows = parseCsv(text);
  const headers = rows.shift() || [];
  return rows
    .filter((row) => row.some((value) => value.trim()))
    .map((row) => Object.fromEntries(
      headers.map((header, index) => [header, row[index] || ""]),
    ) as MigrationItem);
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(items: VerifyResult[]) {
  const headers = [
    "tenant_id",
    "source_table",
    "source_id",
    "source_field",
    "array_index",
    "legacy_value",
    "object_key",
    "verified_status",
    "file_object_status",
    "business_field_status",
    "access_status",
    "current_value",
    "reason",
  ] as const;

  return [
    headers.join(","),
    ...items.map((item) => headers.map((header) => csvEscape(item[header])).join(",")),
  ].join("\n");
}
