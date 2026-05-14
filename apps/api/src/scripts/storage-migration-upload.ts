import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import COS from "cos-nodejs-sdk-v5";
import { platformFileObjectRepository } from "@/repositories/platform-file-objects";
import {
  refreshPlatformCosPublicBaseUrlCache,
  resolveStoredFileUrl,
} from "@/services/files/file-url-resolver";
import { systemSettingsService } from "@/services/system-settings";
import { SupabaseDB } from "@/utils/supabase";

type CliOptions = {
  input: string;
  limit: number;
  outDir: string;
  apply: boolean;
};

type DryRunItem = {
  tenant_id: string;
  source_table: string;
  source_id: string;
  source_field: string;
  array_index: string;
  legacy_value: string;
  value_type: string;
  legacy_bucket: string;
  legacy_path: string;
  target_object_key: string;
  estimated_size_bytes: string;
  status: string;
  reason: string;
};

type MigrationResult = DryRunItem & {
  migrated_status: string;
  file_id: string;
  provider: string;
  bucket: string;
  region: string;
  object_key: string;
  public_url: string;
  mime_type: string;
  size_bytes: string;
  checksum: string;
  access_url_http_status: string;
  migrated_reason: string;
};

const LEGACY_BUCKET = "project-logs";
const DEFAULT_COS_REGION = "ap-guangzhou";

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    input: "",
    limit: 10,
    outDir: "reports/storage-migration-upload",
    apply: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
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
      continue;
    }
    if (arg === "--apply") {
      options.apply = true;
    }
  }

  if (!options.input) {
    throw new Error("请传 --input <dry-run-items.csv>");
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

function readDryRunItems(csvText: string) {
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

function toCsv(items: MigrationResult[]) {
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

function trimSlashes(value: string) {
  return value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

function encodeObjectKey(objectKey: string) {
  return trimSlashes(objectKey)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function joinPublicUrl(baseUrl: string, objectKey: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${encodeObjectKey(objectKey)}`;
}

function legacyPathToPublicUrl(path: string) {
  return SupabaseDB.getAdminClient()
    .storage
    .from(LEGACY_BUCKET)
    .getPublicUrl(path)
    .data.publicUrl;
}

function guessMimeType(input: { contentType: string | null; objectKey: string }) {
  const contentType = input.contentType?.split(";")[0]?.trim();
  if (contentType) {
    return contentType;
  }

  const lower = input.objectKey.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return "application/octet-stream";
}

function sceneForItem(item: DryRunItem) {
  if (item.source_table === "project_logs") return "project_log";
  if (item.source_table === "project_log_comments") return "project_log_comment";
  if (item.source_table === "customer_follow_up_comments") {
    return "customer_follow_up_comment";
  }
  if (item.source_table === "customers") return "customer_douyin_screenshot";
  if (item.source_table === "expense_request_items") return "expense_request";
  if (item.source_table === "expense_request_settlements") {
    return "expense_request_settlement";
  }
  if (item.source_table === "project_referrals") return "referral_payment";
  if (item.source_table === "employees") return "employee_avatar";
  if (item.source_table === "marketing_pages") return "h5_marketing_page";
  if (item.source_table.startsWith("project_acceptance")) return "project_acceptance";
  return item.source_table;
}

async function getCosConfig() {
  const [secretId, secretKey, bucket, region, publicBaseUrl] = await Promise.all([
    systemSettingsService.getSecretString("TENCENT_COS_SECRET_ID"),
    systemSettingsService.getSecretString("TENCENT_COS_SECRET_KEY"),
    systemSettingsService.getString("PLATFORM_COS_BUCKET"),
    systemSettingsService.getString("PLATFORM_COS_REGION", DEFAULT_COS_REGION),
    systemSettingsService.getString("PLATFORM_COS_PUBLIC_BASE_URL"),
  ]);

  if (!secretId || !secretKey || !bucket || !region || !publicBaseUrl) {
    throw new Error(
      "缺少 COS 配置：TENCENT_COS_SECRET_ID/TENCENT_COS_SECRET_KEY/PLATFORM_COS_BUCKET/PLATFORM_COS_REGION/PLATFORM_COS_PUBLIC_BASE_URL",
    );
  }

  return {
    secretId,
    secretKey,
    bucket,
    region,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
  };
}

async function downloadLegacyObject(item: DryRunItem) {
  const url = item.value_type === "supabase_legacy_path"
    ? legacyPathToPublicUrl(item.legacy_path)
    : item.legacy_value;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`download_${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    buffer,
    mimeType: guessMimeType({
      contentType: response.headers.get("content-type"),
      objectKey: item.target_object_key,
    }),
  };
}

async function checkPublicUrl(url: string) {
  try {
    const headResponse = await fetch(url, { method: "HEAD" });
    if (headResponse.ok) {
      return String(headResponse.status);
    }

    const response = await fetch(url, {
      headers: {
        range: "bytes=0-31",
      },
    });
    return String(response.status);
  } catch (error) {
    return error instanceof Error ? error.message : "check_failed";
  }
}

async function migrateOne(input: {
  item: DryRunItem;
  config: Awaited<ReturnType<typeof getCosConfig>>;
  cos: COS;
  apply: boolean;
}): Promise<MigrationResult> {
  const { item, config, cos, apply } = input;
  const emptyResult: MigrationResult = {
    ...item,
    migrated_status: "skipped",
    file_id: "",
    provider: "tencent_cos",
    bucket: config.bucket,
    region: config.region,
    object_key: item.target_object_key,
    public_url: "",
    mime_type: "",
    size_bytes: "",
    checksum: "",
    access_url_http_status: "",
    migrated_reason: "",
  };

  if (item.status !== "migratable" || !item.target_object_key) {
    return {
      ...emptyResult,
      migrated_reason: item.reason || `dry_run_status_${item.status}`,
    };
  }

  const existing = await platformFileObjectRepository.findActiveByObjectKey({
    provider: "tencent_cos",
    bucket: config.bucket,
    objectKey: item.target_object_key,
  });
  if (existing) {
    return {
      ...emptyResult,
      migrated_status: "already_exists",
      file_id: existing.id,
      public_url: existing.public_url || "",
      mime_type: existing.mime_type,
      size_bytes: String(existing.size_bytes),
      checksum: existing.checksum || "",
      access_url_http_status: resolveStoredFileUrl(existing.object_key)
        ? await checkPublicUrl(resolveStoredFileUrl(existing.object_key) || "")
        : "",
      migrated_reason: "platform_file_object_exists",
    };
  }

  if (!apply) {
    return {
      ...emptyResult,
      migrated_status: "planned",
      public_url: joinPublicUrl(config.publicBaseUrl, item.target_object_key),
      access_url_http_status: "",
      migrated_reason: "apply_not_set",
    };
  }

  const downloaded = await downloadLegacyObject(item);
  const checksum = createHash("sha256").update(downloaded.buffer).digest("hex");

  await cos.putObject({
    Bucket: config.bucket,
    Region: config.region,
    Key: item.target_object_key,
    Body: downloaded.buffer,
    ContentLength: downloaded.buffer.length,
    ContentType: downloaded.mimeType,
  });

  const publicUrl = joinPublicUrl(config.publicBaseUrl, item.target_object_key);
  await refreshPlatformCosPublicBaseUrlCache();
  const accessUrl = resolveStoredFileUrl(item.target_object_key) || publicUrl;
  const accessUrlHttpStatus = await checkPublicUrl(accessUrl);
  const fileObject = await platformFileObjectRepository.create({
    tenant_id: item.tenant_id || null,
    owner_type: item.source_table,
    owner_id: item.source_id || null,
    scene: sceneForItem(item),
    provider: "tencent_cos",
    bucket: config.bucket,
    region: config.region,
    object_key: item.target_object_key,
    original_name: basename(item.legacy_path || item.legacy_value) || null,
    mime_type: downloaded.mimeType,
    size_bytes: downloaded.buffer.length,
    checksum,
    visibility: "public",
    public_url: publicUrl,
    legacy_url: item.value_type === "supabase_public_url" ? item.legacy_value : null,
    legacy_path: item.legacy_path || null,
    metadata: {
      migration_source: "storage-migration-upload",
      dry_run_status: item.status,
      source_table: item.source_table,
      source_id: item.source_id,
      source_field: item.source_field,
      array_index: item.array_index || null,
      legacy_value: item.legacy_value,
    },
  });

  return {
    ...emptyResult,
    migrated_status: "uploaded",
    file_id: fileObject.id,
    public_url: publicUrl,
    mime_type: downloaded.mimeType,
    size_bytes: String(downloaded.buffer.length),
    checksum,
    access_url_http_status: accessUrlHttpStatus,
  };
}

function summarize(items: MigrationResult[], startedAt: string, apply: boolean) {
  const counts = new Map<string, number>();
  let bytes = 0;

  for (const item of items) {
    counts.set(item.migrated_status, (counts.get(item.migrated_status) || 0) + 1);
    bytes += Number(item.size_bytes || 0);
  }

  return {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    apply,
    total_items: items.length,
    uploaded: counts.get("uploaded") || 0,
    planned: counts.get("planned") || 0,
    already_exists: counts.get("already_exists") || 0,
    failed: counts.get("failed") || 0,
    skipped: counts.get("skipped") || 0,
    uploaded_bytes: bytes,
    status_counts: Object.fromEntries(counts.entries()),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const outputDir = join(options.outDir, stamp);
  const dryRunItems = readDryRunItems(await readFile(options.input, "utf8"))
    .filter((item) => item.status === "migratable")
    .slice(0, options.limit);
  const config = await getCosConfig();
  await refreshPlatformCosPublicBaseUrlCache();
  const cos = new COS({
    SecretId: config.secretId,
    SecretKey: config.secretKey,
  });
  const results: MigrationResult[] = [];

  for (const item of dryRunItems) {
    try {
      results.push(await migrateOne({
        item,
        config,
        cos,
        apply: options.apply,
      }));
    } catch (error) {
      results.push({
        ...item,
        migrated_status: "failed",
        file_id: "",
        provider: "tencent_cos",
        bucket: config.bucket,
        region: config.region,
        object_key: item.target_object_key,
        public_url: "",
        mime_type: "",
        size_bytes: "",
        checksum: "",
        access_url_http_status: "",
        migrated_reason: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "summary.json"),
    `${JSON.stringify(summarize(results, startedAt, options.apply), null, 2)}\n`,
  );
  await writeFile(join(outputDir, "migration-items.csv"), `${toCsv(results)}\n`);

  const summary = summarize(results, startedAt, options.apply);
  console.log(`migration report: ${outputDir}`);
  console.log(`uploaded=${summary.uploaded}, planned=${summary.planned}, failed=${summary.failed}, already_exists=${summary.already_exists}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
