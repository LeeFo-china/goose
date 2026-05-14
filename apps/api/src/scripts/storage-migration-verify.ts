import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { platformFileObjectRepository } from "@/repositories/platform-file-objects";
import {
  refreshPlatformCosPublicBaseUrlCache,
  resolveStoredFileUrl,
} from "@/services/files/file-url-resolver";
import { SupabaseDB } from "@/utils/supabase";

type CliOptions = {
  input: string;
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
  value_type: string;
  legacy_bucket: string;
  legacy_path: string;
  object_key: string;
  file_id: string;
  size_bytes: string;
  checksum: string;
  migrated_status: string;
};

type VerifyResult = MigrationItem & {
  verified_status: string;
  legacy_size_bytes: string;
  legacy_checksum: string;
  cos_size_bytes: string;
  cos_checksum: string;
  access_status: string;
  reason: string;
};

const LEGACY_BUCKET = "project-logs";

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    input: "",
    limit: 5,
    outDir: "reports/storage-migration-verify",
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

  if (!options.input) throw new Error("请传 --input <migration-items.csv>");
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
    "file_id",
    "verified_status",
    "legacy_size_bytes",
    "legacy_checksum",
    "cos_size_bytes",
    "cos_checksum",
    "access_status",
    "reason",
  ] as const;

  return [
    headers.join(","),
    ...items.map((item) => headers.map((header) => csvEscape(item[header])).join(",")),
  ].join("\n");
}

function legacyPathToPublicUrl(path: string) {
  return SupabaseDB.getAdminClient()
    .storage
    .from(LEGACY_BUCKET)
    .getPublicUrl(path)
    .data.publicUrl;
}

async function downloadUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download_${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    size: buffer.length,
    checksum: createHash("sha256").update(buffer).digest("hex"),
  };
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

async function verifyOne(item: MigrationItem): Promise<VerifyResult> {
  const base: VerifyResult = {
    ...item,
    verified_status: "failed",
    legacy_size_bytes: "",
    legacy_checksum: "",
    cos_size_bytes: "",
    cos_checksum: "",
    access_status: "",
    reason: "",
  };

  try {
    const objectKey = item.object_key;
    const fileObject = await platformFileObjectRepository.findActiveByObjectKey({
      provider: "tencent_cos",
      objectKey,
    });
    if (!fileObject) {
      return { ...base, reason: "file_object_not_found" };
    }

    const legacyUrl = item.value_type === "supabase_legacy_path"
      ? legacyPathToPublicUrl(item.legacy_path)
      : item.legacy_value;
    const [legacy, cos] = await Promise.all([
      downloadUrl(legacyUrl),
      downloadUrl(resolveStoredFileUrl(objectKey) || fileObject.public_url || ""),
    ]);
    const accessStatus = await checkAccessStatus(objectKey);
    const matched = legacy.size === cos.size &&
      legacy.checksum === cos.checksum &&
      fileObject.checksum === cos.checksum;

    return {
      ...base,
      verified_status: matched ? "matched" : "mismatch",
      legacy_size_bytes: String(legacy.size),
      legacy_checksum: legacy.checksum,
      cos_size_bytes: String(cos.size),
      cos_checksum: cos.checksum,
      access_status: accessStatus,
      reason: matched ? "" : "size_or_checksum_mismatch",
    };
  } catch (error) {
    return {
      ...base,
      reason: error instanceof Error ? error.message : "verify_failed",
    };
  }
}

function summarize(items: VerifyResult[], startedAt: string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.verified_status, (counts.get(item.verified_status) || 0) + 1);
  }

  return {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    total_items: items.length,
    matched: counts.get("matched") || 0,
    mismatch: counts.get("mismatch") || 0,
    failed: counts.get("failed") || 0,
    status_counts: Object.fromEntries(counts.entries()),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const outputDir = join(options.outDir, stamp);
  await refreshPlatformCosPublicBaseUrlCache();

  const sourceItems = readItems(await readFile(options.input, "utf8"))
    .filter((item) => ["uploaded", "already_exists"].includes(item.migrated_status))
    .slice(0, options.limit);
  const results: VerifyResult[] = [];

  for (const item of sourceItems) {
    results.push(await verifyOne(item));
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "summary.json"),
    `${JSON.stringify(summarize(results, startedAt), null, 2)}\n`,
  );
  await writeFile(join(outputDir, "verify-items.csv"), `${toCsv(results)}\n`);

  const summary = summarize(results, startedAt);
  console.log(`verify report: ${outputDir}`);
  console.log(`matched=${summary.matched}, mismatch=${summary.mismatch}, failed=${summary.failed}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
