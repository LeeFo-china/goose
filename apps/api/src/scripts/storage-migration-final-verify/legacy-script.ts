import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { platformFileObjectRepository } from "@/repositories/platform-file-objects";
import {
  refreshPlatformCosPublicBaseUrlCache,
  resolveStoredFileUrl,
} from "@/services/files/file-url-resolver";
import { SupabaseDB } from "@/utils/supabase";

type CliOptions = {
  inputs: string[];
  limit: number;
  outDir: string;
};

type MigrationItem = {
  tenant_id: string;
  source_table: string;
  source_id: string;
  source_field: string;
  array_index: string;
  legacy_value: string;
  object_key: string;
  target_object_key: string;
  migrated_status: string;
};

type VerifyResult = MigrationItem & {
  object_key: string;
  verified_status: string;
  file_object_status: string;
  business_field_status: string;
  access_status: string;
  current_value: string;
  reason: string;
};

type SourceConfig = {
  table: string;
  field: string;
  kind: "array" | "single" | "metadata";
  hasTenantId: boolean;
};

const SOURCE_CONFIGS: SourceConfig[] = [
  { table: "project_logs", field: "images", kind: "array", hasTenantId: true },
  { table: "project_log_comments", field: "images", kind: "array", hasTenantId: true },
  { table: "project_acceptance_items", field: "images", kind: "array", hasTenantId: true },
  { table: "project_acceptance_items", field: "rectification_images", kind: "array", hasTenantId: true },
  { table: "project_acceptance_actions", field: "metadata.images", kind: "metadata", hasTenantId: true },
  { table: "project_acceptance_actions", field: "metadata.referenced_image_paths", kind: "metadata", hasTenantId: true },
  { table: "project_acceptance_actions", field: "metadata.referenced_images.path", kind: "metadata", hasTenantId: true },
  { table: "project_acceptance_actions", field: "metadata.referenced_images.url", kind: "metadata", hasTenantId: true },
  { table: "project_acceptance_actions", field: "metadata.referenced_images.thumb_url", kind: "metadata", hasTenantId: true },
  { table: "customers", field: "douyin_screenshot_images", kind: "array", hasTenantId: true },
  { table: "expense_request_items", field: "evidence_images", kind: "array", hasTenantId: true },
  { table: "expense_request_settlements", field: "evidence_images", kind: "array", hasTenantId: true },
  { table: "project_referrals", field: "paid_evidence_images", kind: "array", hasTenantId: false },
  { table: "employees", field: "avatar", kind: "single", hasTenantId: true },
  { table: "customers", field: "avatar", kind: "single", hasTenantId: true },
  { table: "marketing_pages", field: "cover_image", kind: "single", hasTenantId: true },
];

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputs: [],
    limit: 100000,
    outDir: "reports/storage-migration-final-verify",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--input") {
      const value = argv[index + 1] || "";
      if (value) options.inputs.push(value);
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

  if (options.inputs.length === 0) {
    throw new Error("请至少传一个 --input <migration-items.csv>");
  }
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
    ) as MigrationItem);
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(items: VerifyResult[]) {
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

function objectKeyOf(item: MigrationItem) {
  return item.object_key || item.target_object_key;
}

function configFor(item: MigrationItem) {
  return SOURCE_CONFIGS.find((config) =>
    config.table === item.source_table && config.field === item.source_field
  ) || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function emptyResult(item: MigrationItem): VerifyResult {
  return {
    ...item,
    object_key: objectKeyOf(item),
    verified_status: "failed",
    file_object_status: "",
    business_field_status: "",
    access_status: "",
    current_value: "",
    reason: "",
  };
}

async function fetchSourceRow(table: string, id: string) {
  switch (table) {
    case "project_logs": {
      const { data, error } = await SupabaseDB.getAdminClient()
        .from("project_logs")
        .select("id,tenant_id,images")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Record<string, unknown> | null;
    }
    case "project_log_comments": {
      const { data, error } = await SupabaseDB.getAdminClient()
        .from("project_log_comments")
        .select("id,tenant_id,images")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Record<string, unknown> | null;
    }
    case "project_acceptance_items": {
      const { data, error } = await SupabaseDB.getAdminClient()
        .from("project_acceptance_items")
        .select("id,tenant_id,images,rectification_images")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Record<string, unknown> | null;
    }
    case "project_acceptance_actions": {
      const { data, error } = await SupabaseDB.getAdminClient()
        .from("project_acceptance_actions")
        .select("id,tenant_id,metadata")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Record<string, unknown> | null;
    }
    case "customers": {
      const { data, error } = await SupabaseDB.getAdminClient()
        .from("customers")
        .select("id,tenant_id,douyin_screenshot_images,avatar")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Record<string, unknown> | null;
    }
    case "expense_request_items": {
      const { data, error } = await SupabaseDB.getAdminClient()
        .from("expense_request_items")
        .select("id,tenant_id,evidence_images")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Record<string, unknown> | null;
    }
    case "expense_request_settlements": {
      const { data, error } = await SupabaseDB.getAdminClient()
        .from("expense_request_settlements")
        .select("id,tenant_id,evidence_images")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Record<string, unknown> | null;
    }
    case "project_referrals": {
      const { data, error } = await SupabaseDB.getAdminClient()
        .from("project_referrals")
        .select("id,paid_evidence_images")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Record<string, unknown> | null;
    }
    case "employees": {
      const { data, error } = await SupabaseDB.getAdminClient()
        .from("employees")
        .select("id,tenant_id,avatar")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Record<string, unknown> | null;
    }
    case "marketing_pages": {
      const { data, error } = await SupabaseDB.getAdminClient()
        .from("marketing_pages")
        .select("id,tenant_id,cover_image")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Record<string, unknown> | null;
    }
    default:
      throw new Error(`unsupported_source_table_${table}`);
  }
}

function readMetadataValue(input: {
  metadata: unknown;
  field: string;
  index: number;
}) {
  const metadata = isRecord(input.metadata) ? input.metadata : {};
  if (input.field === "metadata.images") {
    return normalizeArray(metadata.images)[input.index];
  }
  if (input.field === "metadata.referenced_image_paths") {
    return normalizeArray(metadata.referenced_image_paths)[input.index];
  }
  if (input.field.startsWith("metadata.referenced_images.")) {
    const leaf = input.field.replace("metadata.referenced_images.", "");
    const reference = normalizeArray(metadata.referenced_images)[input.index];
    return isRecord(reference) ? reference[leaf] : undefined;
  }

  return undefined;
}

function readBusinessValue(input: {
  item: MigrationItem;
  config: SourceConfig;
  row: Record<string, unknown>;
}) {
  const { item, config, row } = input;
  if (config.kind === "single") {
    return row[config.field];
  }

  const index = Number(item.array_index);
  if (!Number.isInteger(index) || index < 0) {
    return undefined;
  }

  if (config.kind === "metadata") {
    return readMetadataValue({
      metadata: row.metadata,
      field: config.field,
      index,
    });
  }

  return normalizeArray(row[config.field])[index];
}

async function checkAccessStatus(objectKey: string) {
  const url = resolveStoredFileUrl(objectKey);
  if (!url) return "";

  const response = await fetch(url, {
    headers: {
      range: "bytes=0-31",
    },
  });
  return String(response.status);
}

async function verifyOne(item: MigrationItem) {
  const result = emptyResult(item);
  const objectKey = objectKeyOf(item);
  const config = configFor(item);

  if (!objectKey) {
    return { ...result, reason: "missing_object_key" };
  }
  if (!config) {
    return { ...result, reason: "unsupported_source_field" };
  }

  const reasons: string[] = [];
  const fileObject = await platformFileObjectRepository.findActiveByObjectKey({
    provider: "tencent_cos",
    objectKey,
  });
  const fileObjectStatus = fileObject ? "found" : "missing";
  if (!fileObject) reasons.push("file_object_missing");

  const row = await fetchSourceRow(item.source_table, item.source_id);
  if (!row) {
    return {
      ...result,
      file_object_status: fileObjectStatus,
      business_field_status: "missing",
      reason: [...reasons, "source_row_missing"].join(";"),
    };
  }

  if (config.hasTenantId && item.tenant_id && row.tenant_id !== item.tenant_id) {
    reasons.push("tenant_mismatch");
  }

  const currentValue = readBusinessValue({ item, config, row });
  const businessFieldStatus = currentValue === objectKey ? "matched" : "mismatch";
  if (businessFieldStatus !== "matched") {
    reasons.push("business_field_mismatch");
  }

  let accessStatus = "";
  try {
    accessStatus = await checkAccessStatus(objectKey);
    if (!["200", "206"].includes(accessStatus)) {
      reasons.push(`access_${accessStatus || "empty"}`);
    }
  } catch (error) {
    accessStatus = error instanceof Error ? error.message : "access_failed";
    reasons.push(accessStatus);
  }

  return {
    ...result,
    verified_status: reasons.length === 0 ? "passed" : "failed",
    file_object_status: fileObjectStatus,
    business_field_status: businessFieldStatus,
    access_status: accessStatus,
    current_value: typeof currentValue === "string"
      ? currentValue
      : JSON.stringify(currentValue ?? null),
    reason: reasons.join(";"),
  };
}

function summarize(items: VerifyResult[], startedAt: string) {
  const counts = new Map<string, number>();
  const tableCounts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.verified_status, (counts.get(item.verified_status) || 0) + 1);
    tableCounts.set(item.source_table, (tableCounts.get(item.source_table) || 0) + 1);
  }

  return {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    total_items: items.length,
    passed: counts.get("passed") || 0,
    failed: counts.get("failed") || 0,
    status_counts: Object.fromEntries(counts.entries()),
    source_table_counts: Object.fromEntries(tableCounts.entries()),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const outputDir = join(options.outDir, stamp);
  await refreshPlatformCosPublicBaseUrlCache();

  const byObjectKey = new Map<string, MigrationItem>();
  for (const inputPath of options.inputs) {
    const items = readItems(await readFile(inputPath, "utf8"));
    for (const item of items) {
      if (!["uploaded", "already_exists"].includes(item.migrated_status)) {
        continue;
      }

      const objectKey = objectKeyOf(item);
      if (!objectKey) continue;
      byObjectKey.set(objectKey, item);
    }
  }

  const sourceItems = Array.from(byObjectKey.values()).slice(0, options.limit);
  const results: VerifyResult[] = [];

  for (const [index, item] of sourceItems.entries()) {
    results.push(await verifyOne(item));
    if ((index + 1) % 10 === 0 || index + 1 === sourceItems.length) {
      console.log(`progress ${index + 1}/${sourceItems.length}`);
    }
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "summary.json"),
    `${JSON.stringify(summarize(results, startedAt), null, 2)}\n`,
  );
  await writeFile(join(outputDir, "final-verify-items.csv"), `${toCsv(results)}\n`);

  const summary = summarize(results, startedAt);
  console.log(`final verify report: ${outputDir}`);
  console.log(`passed=${summary.passed}, failed=${summary.failed}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
