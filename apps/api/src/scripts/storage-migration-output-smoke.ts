import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  refreshPlatformCosPublicBaseUrlCache,
  resolveStoredFileUrl,
} from "@/services/files/file-url-resolver";

type CliOptions = {
  input: string;
  limit: number;
  outDir: string;
};

type VerifyItem = {
  tenant_id: string;
  source_table: string;
  source_id: string;
  source_field: string;
  array_index: string;
  object_key: string;
  verified_status: string;
  current_value: string;
};

type SmokeResult = VerifyItem & {
  smoke_status: string;
  resolved_url_is_http: string;
  resolved_url_is_raw_key: string;
  access_status: string;
  reason: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    input: "",
    limit: 100000,
    outDir: "reports/storage-migration-output-smoke",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--input") {
      options.input = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      options.limit = Number(argv[index + 1] || options.limit);
      index += 1;
      continue;
    }
    if (arg === "--out") {
      options.outDir = argv[index + 1] || options.outDir;
      index += 1;
    }
  }

  if (!options.input) throw new Error("请传 --input <final-verify-items.csv>");
  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    throw new Error("--limit 必须是大于 0 的数字");
  }

  return options;
}

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

function readItems(text: string) {
  const rows = parseCsv(text);
  const headers = rows.shift() || [];
  return rows
    .filter((row) => row.some((value) => value.trim()))
    .map((row) => Object.fromEntries(
      headers.map((header, index) => [header, row[index] || ""]),
    ) as VerifyItem);
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(items: SmokeResult[]) {
  const headers = [
    "tenant_id",
    "source_table",
    "source_id",
    "source_field",
    "array_index",
    "object_key",
    "current_value",
    "smoke_status",
    "resolved_url_is_http",
    "resolved_url_is_raw_key",
    "access_status",
    "reason",
  ] as const;

  return [
    headers.join(","),
    ...items.map((item) => headers.map((header) => csvEscape(item[header])).join(",")),
  ].join("\n");
}

async function smokeOne(item: VerifyItem): Promise<SmokeResult> {
  const base: SmokeResult = {
    ...item,
    smoke_status: "failed",
    resolved_url_is_http: "false",
    resolved_url_is_raw_key: "false",
    access_status: "",
    reason: "",
  };
  const value = item.current_value || item.object_key;
  const url = resolveStoredFileUrl(value);
  const reasons: string[] = [];

  if (!url) {
    reasons.push("resolve_empty");
  }

  const isHttp = /^https?:\/\//i.test(url || "");
  const isRawKey = url === value || /^tenants\//.test(url || "");
  if (!isHttp) reasons.push("resolved_url_not_http");
  if (isRawKey) reasons.push("resolved_url_is_raw_key");

  let accessStatus = "";
  if (url && isHttp) {
    try {
      const response = await fetch(url, {
        headers: {
          range: "bytes=0-31",
        },
      });
      accessStatus = String(response.status);
      if (!["200", "206"].includes(accessStatus)) {
        reasons.push(`access_${accessStatus}`);
      }
    } catch (error) {
      accessStatus = error instanceof Error ? error.message : "access_failed";
      reasons.push(accessStatus);
    }
  }

  return {
    ...base,
    smoke_status: reasons.length === 0 ? "passed" : "failed",
    resolved_url_is_http: String(isHttp),
    resolved_url_is_raw_key: String(isRawKey),
    access_status: accessStatus,
    reason: reasons.join(";"),
  };
}

function summarize(items: SmokeResult[], startedAt: string) {
  const statusCounts = new Map<string, number>();
  const tableCounts = new Map<string, number>();
  for (const item of items) {
    statusCounts.set(item.smoke_status, (statusCounts.get(item.smoke_status) || 0) + 1);
    tableCounts.set(item.source_table, (tableCounts.get(item.source_table) || 0) + 1);
  }

  return {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    total_items: items.length,
    passed: statusCounts.get("passed") || 0,
    failed: statusCounts.get("failed") || 0,
    status_counts: Object.fromEntries(statusCounts.entries()),
    source_table_counts: Object.fromEntries(tableCounts.entries()),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const outputDir = join(options.outDir, stamp);
  await refreshPlatformCosPublicBaseUrlCache();

  const sourceItems = readItems(await readFile(options.input, "utf8"))
    .filter((item) => item.verified_status === "passed")
    .slice(0, options.limit);
  const results: SmokeResult[] = [];

  for (const [index, item] of sourceItems.entries()) {
    results.push(await smokeOne(item));
    if ((index + 1) % 10 === 0 || index + 1 === sourceItems.length) {
      console.log(`progress ${index + 1}/${sourceItems.length}`);
    }
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "summary.json"),
    `${JSON.stringify(summarize(results, startedAt), null, 2)}\n`,
  );
  await writeFile(join(outputDir, "output-smoke-items.csv"), `${toCsv(results)}\n`);

  const summary = summarize(results, startedAt);
  console.log(`output smoke report: ${outputDir}`);
  console.log(`passed=${summary.passed}, failed=${summary.failed}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
