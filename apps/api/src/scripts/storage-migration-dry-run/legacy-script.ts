import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SupabaseDB } from "@/utils/supabase";

type CliOptions = {
  tenantId: string | null;
  allTenants: boolean;
  limit: number;
  outDir: string;
  checkRemote: boolean;
};

type SourceConfig = {
  priority: "P0" | "P1";
  table: string;
  select: string;
  field: string;
  scene: string;
  hasDirectTenantId: boolean;
  tenantId: (row: Record<string, unknown>) => string | null;
  values: (row: Record<string, unknown>) => Array<{
    sourceField: string;
    value: unknown;
    arrayIndex: number | null;
  }>;
};

type ReportItem = {
  tenant_id: string | null;
  source_table: string;
  source_id: string;
  source_field: string;
  array_index: number | null;
  legacy_value: string;
  value_type: string;
  legacy_bucket: string | null;
  legacy_path: string | null;
  target_object_key: string | null;
  estimated_size_bytes: number | null;
  status: string;
  reason: string | null;
};

const LEGACY_BUCKET = "project-logs";
const COS_PREFIXES = ["tenants/", "public/", "system/"];

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    tenantId: null,
    allTenants: false,
    limit: 500,
    outDir: "reports/storage-migration",
    checkRemote: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--tenant-id") {
      options.tenantId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--all-tenants") {
      options.allTenants = true;
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
    if (arg === "--check-remote") {
      options.checkRemote = true;
    }
  }

  if (!options.tenantId && !options.allTenants) {
    throw new Error("请传 --tenant-id <uuid> 或 --all-tenants");
  }

  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    throw new Error("--limit 必须是大于 0 的数字");
  }

  return options;
}

function getNestedTenantId(value: unknown): string | null {
  if (Array.isArray(value)) {
    return getNestedTenantId(value[0]);
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  if (typeof row.tenant_id === "string") {
    return row.tenant_id;
  }

  for (const nested of Object.values(row)) {
    const tenantId = getNestedTenantId(nested);
    if (tenantId) {
      return tenantId;
    }
  }

  return null;
}

function stringArrayValues(field: string, value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => ({
    sourceField: field,
    value: item,
    arrayIndex: index,
  }));
}

function nestedMetadataValues(row: Record<string, unknown>) {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }

  const data = metadata as Record<string, unknown>;
  const values = [
    ...stringArrayValues("metadata.images", data.images),
    ...stringArrayValues("metadata.referenced_image_paths", data.referenced_image_paths),
  ];

  if (Array.isArray(data.referenced_images)) {
    data.referenced_images.forEach((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return;
      }
      const image = item as Record<string, unknown>;
      for (const field of ["path", "url", "thumb_url"]) {
        values.push({
          sourceField: `metadata.referenced_images.${field}`,
          value: image[field],
          arrayIndex: index,
        });
      }
    });
  }

  return values;
}

function singleValue(field: string, value: unknown) {
  if (normalizeString(value) === "") {
    return [];
  }

  return [{ sourceField: field, value, arrayIndex: null }];
}

const sources: SourceConfig[] = [
  {
    priority: "P0",
    table: "project_logs",
    select: "id,tenant_id,images",
    field: "images",
    scene: "project-log",
    hasDirectTenantId: true,
    tenantId: (row) => typeof row.tenant_id === "string" ? row.tenant_id : null,
    values: (row) => stringArrayValues("images", row.images),
  },
  {
    priority: "P0",
    table: "project_log_comments",
    select: "id,tenant_id,images",
    field: "images",
    scene: "project-log-comment",
    hasDirectTenantId: true,
    tenantId: (row) => typeof row.tenant_id === "string" ? row.tenant_id : null,
    values: (row) => stringArrayValues("images", row.images),
  },
  {
    priority: "P0",
    table: "project_acceptance_items",
    select: "id,tenant_id,images,rectification_images",
    field: "images,rectification_images",
    scene: "project-acceptance",
    hasDirectTenantId: true,
    tenantId: (row) => typeof row.tenant_id === "string" ? row.tenant_id : null,
    values: (row) => [
      ...stringArrayValues("images", row.images),
      ...stringArrayValues("rectification_images", row.rectification_images),
    ],
  },
  {
    priority: "P0",
    table: "project_acceptance_actions",
    select: "id,tenant_id,metadata",
    field: "metadata",
    scene: "project-acceptance",
    hasDirectTenantId: true,
    tenantId: (row) => typeof row.tenant_id === "string" ? row.tenant_id : null,
    values: nestedMetadataValues,
  },
  {
    priority: "P1",
    table: "customer_follow_up_comments",
    select: "id,images,follow_up:customer_follow_ups(customer:customers(tenant_id))",
    field: "images",
    scene: "customer-follow-up-comment",
    hasDirectTenantId: false,
    tenantId: (row) => getNestedTenantId(row.follow_up),
    values: (row) => stringArrayValues("images", row.images),
  },
  {
    priority: "P1",
    table: "customers",
    select: "id,tenant_id,douyin_screenshot_images",
    field: "douyin_screenshot_images",
    scene: "customer-douyin-screenshot",
    hasDirectTenantId: true,
    tenantId: (row) => typeof row.tenant_id === "string" ? row.tenant_id : null,
    values: (row) =>
      stringArrayValues("douyin_screenshot_images", row.douyin_screenshot_images),
  },
  {
    priority: "P1",
    table: "expense_request_items",
    select: "id,tenant_id,evidence_images",
    field: "evidence_images",
    scene: "expense-request",
    hasDirectTenantId: true,
    tenantId: (row) => typeof row.tenant_id === "string" ? row.tenant_id : null,
    values: (row) => stringArrayValues("evidence_images", row.evidence_images),
  },
  {
    priority: "P1",
    table: "expense_request_settlements",
    select: "id,tenant_id,evidence_images",
    field: "evidence_images",
    scene: "expense-request-settlement",
    hasDirectTenantId: true,
    tenantId: (row) => typeof row.tenant_id === "string" ? row.tenant_id : null,
    values: (row) => stringArrayValues("evidence_images", row.evidence_images),
  },
  {
    priority: "P1",
    table: "project_referrals",
    select: "id,paid_evidence_images,project:projects(tenant_id)",
    field: "paid_evidence_images",
    scene: "project-referral",
    hasDirectTenantId: false,
    tenantId: (row) => getNestedTenantId(row.project),
    values: (row) => stringArrayValues("paid_evidence_images", row.paid_evidence_images),
  },
  {
    priority: "P1",
    table: "employees",
    select: "id,tenant_id,avatar",
    field: "avatar",
    scene: "employee-avatar",
    hasDirectTenantId: true,
    tenantId: (row) => typeof row.tenant_id === "string" ? row.tenant_id : null,
    values: (row) => singleValue("avatar", row.avatar),
  },
  {
    priority: "P1",
    table: "marketing_pages",
    select: "id,tenant_id,cover_image",
    field: "cover_image",
    scene: "h5-marketing-page",
    hasDirectTenantId: true,
    tenantId: (row) => typeof row.tenant_id === "string" ? row.tenant_id : null,
    values: (row) => singleValue("cover_image", row.cover_image),
  },
];

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isCosObjectKey(value: string) {
  return COS_PREFIXES.some((prefix) => value.replace(/^\/+/, "").startsWith(prefix));
}

function getCosPublicHost() {
  const baseUrl = (
    process.env.PLATFORM_COS_PUBLIC_BASE_URL ||
    process.env.COS_PUBLIC_BASE_URL ||
    ""
  ).trim();
  if (!baseUrl) {
    return null;
  }

  try {
    return new URL(baseUrl).host;
  } catch {
    return null;
  }
}

function classifyValue(value: string) {
  if (isCosObjectKey(value)) {
    return {
      valueType: "cos_object_key",
      status: "already_cos",
      legacyBucket: null,
      legacyPath: null,
      reason: null,
    };
  }

  if (isHttpUrl(value)) {
    const url = new URL(value);
    const cosHost = getCosPublicHost();
    if (cosHost && url.host === cosHost) {
      return {
        valueType: "cos_url",
        status: "already_cos",
        legacyBucket: null,
        legacyPath: null,
        reason: null,
      };
    }

    const marker = `/storage/v1/object/public/${LEGACY_BUCKET}/`;
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex >= 0) {
      return {
        valueType: "supabase_public_url",
        status: "migratable",
        legacyBucket: LEGACY_BUCKET,
        legacyPath: decodeURIComponent(url.pathname.slice(markerIndex + marker.length)),
        reason: null,
      };
    }

    return {
      valueType: "external_url",
      status: "skipped",
      legacyBucket: null,
      legacyPath: null,
      reason: "external_url",
    };
  }

  return {
    valueType: "supabase_legacy_path",
    status: "migratable",
    legacyBucket: LEGACY_BUCKET,
    legacyPath: value.replace(/^\/+/, ""),
    reason: null,
  };
}

function getExtension(value: string) {
  const cleanValue = value.split("?")[0] || value;
  const matched = cleanValue.match(/\.([a-zA-Z0-9]{1,8})$/);
  return matched?.[1]?.toLowerCase() || "bin";
}

function buildTargetObjectKey(input: {
  tenantId: string | null;
  scene: string;
  sourceTable: string;
  sourceId: string;
  sourceField: string;
  arrayIndex: number | null;
  legacyValue: string;
}) {
  const hash = createHash("sha1").update(input.legacyValue).digest("hex").slice(0, 12);
  const ext = getExtension(input.legacyValue);
  const date = new Date();
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const safeField = input.sourceField.replace(/[^a-zA-Z0-9_-]+/g, "-");
  const safeIndex = input.arrayIndex === null ? "single" : String(input.arrayIndex);
  const scope = input.tenantId ? `tenants/${input.tenantId}` : "public";

  return [
    scope,
    input.scene,
    "legacy",
    yyyy,
    mm,
    dd,
    `${input.sourceTable}-${input.sourceId}-${safeField}-${safeIndex}-${hash}.${ext}`,
  ].join("/");
}

function legacyPathToPublicUrl(path: string) {
  return SupabaseDB.getAdminClient()
    .storage
    .from(LEGACY_BUCKET)
    .getPublicUrl(path)
    .data.publicUrl;
}

async function checkRemoteSize(item: {
  status: string;
  valueType: string;
  legacyValue: string;
  legacyPath: string | null;
}) {
  if (item.status !== "migratable") {
    return { status: item.status, size: null, reason: null };
  }

  const url = item.valueType === "supabase_legacy_path" && item.legacyPath
    ? legacyPathToPublicUrl(item.legacyPath)
    : item.legacyValue;

  try {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) {
      return {
        status: "download_failed",
        size: null,
        reason: `head_${response.status}`,
      };
    }

    const size = Number(response.headers.get("content-length") || "");
    return {
      status: item.status,
      size: Number.isFinite(size) ? size : null,
      reason: null,
    };
  } catch (error) {
    return {
      status: "download_failed",
      size: null,
      reason: error instanceof Error ? error.message : "head_failed",
    };
  }
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

function toCsv<T extends Record<string, unknown>>(
  items: T[],
  headers: Array<keyof T & string>,
) {
  return [
    headers.join(","),
    ...items.map((item) => headers.map((header) => csvEscape(item[header])).join(",")),
  ].join("\n");
}

function toReportCsv(items: ReportItem[]) {
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

async function scanSource(source: SourceConfig, options: CliOptions, remaining: number) {
  let query = SupabaseDB.getAdminClient()
    .from(source.table)
    .select(source.select)
    .limit(Math.max(remaining, 1));

  if (options.tenantId && source.hasDirectTenantId) {
    query = query.eq("tenant_id", options.tenantId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`扫描 ${source.table} 失败: ${error.message}`);
  }

  const items: ReportItem[] = [];

  for (const row of ((data || []) as unknown as Record<string, unknown>[])) {
    const tenantId = source.tenantId(row);
    if (options.tenantId && tenantId && tenantId !== options.tenantId) {
      continue;
    }

    const sourceId = normalizeString(row.id);
    if (!sourceId) {
      continue;
    }

    for (const value of source.values(row)) {
      if (items.length >= remaining) {
        return items;
      }

      const legacyValue = normalizeString(value.value);
      if (!legacyValue) {
        items.push({
          tenant_id: tenantId,
          source_table: source.table,
          source_id: sourceId,
          source_field: value.sourceField,
          array_index: value.arrayIndex,
          legacy_value: "",
          value_type: "invalid",
          legacy_bucket: null,
          legacy_path: null,
          target_object_key: null,
          estimated_size_bytes: null,
          status: "invalid",
          reason: "empty_or_non_string",
        });
        continue;
      }

      const classification = classifyValue(legacyValue);
      const targetObjectKey = classification.status === "migratable"
        ? buildTargetObjectKey({
          tenantId,
          scene: source.scene,
          sourceTable: source.table,
          sourceId,
          sourceField: value.sourceField,
          arrayIndex: value.arrayIndex,
          legacyValue,
        })
        : null;

      const remote = options.checkRemote
        ? await checkRemoteSize({
          status: classification.status,
          valueType: classification.valueType,
          legacyValue,
          legacyPath: classification.legacyPath,
        })
        : { status: classification.status, size: null, reason: classification.reason };

      items.push({
        tenant_id: tenantId,
        source_table: source.table,
        source_id: sourceId,
        source_field: value.sourceField,
        array_index: value.arrayIndex,
        legacy_value: legacyValue,
        value_type: classification.valueType,
        legacy_bucket: classification.legacyBucket,
        legacy_path: classification.legacyPath,
        target_object_key: targetObjectKey,
        estimated_size_bytes: remote.size,
        status: remote.status,
        reason: remote.reason ?? classification.reason,
      });
    }
  }

  return items;
}

function summarize(items: ReportItem[], startedAt: string) {
  const counts = new Map<string, number>();
  let estimatedBytes = 0;

  for (const item of items) {
    counts.set(item.status, (counts.get(item.status) || 0) + 1);
    estimatedBytes += item.estimated_size_bytes || 0;
  }

  return {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    dry_run: true,
    total_values: items.length,
    migratable: counts.get("migratable") || 0,
    already_cos: counts.get("already_cos") || 0,
    external_url: items.filter((item) => item.value_type === "external_url").length,
    invalid: counts.get("invalid") || 0,
    download_failed: counts.get("download_failed") || 0,
    estimated_bytes: estimatedBytes,
    status_counts: Object.fromEntries(counts.entries()),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const outputDir = join(options.outDir, stamp);
  const items: ReportItem[] = [];

  for (const source of sources) {
    if (items.length >= options.limit) {
      break;
    }

    const sourceItems = await scanSource(source, options, options.limit - items.length);
    items.push(...sourceItems);
  }

  const failures = items.filter((item) =>
    ["invalid", "download_failed"].includes(item.status)
  );
  const tenants = Array.from(new Set(items.map((item) => item.tenant_id || "public")))
    .sort()
    .map((tenantId) => ({
      tenant_id: tenantId === "public" ? null : tenantId,
      total_values: items.filter((item) => (item.tenant_id || "public") === tenantId).length,
      migratable: items.filter((item) =>
        (item.tenant_id || "public") === tenantId && item.status === "migratable"
      ).length,
    }));

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "summary.json"),
    `${JSON.stringify(summarize(items, startedAt), null, 2)}\n`,
  );
  await writeFile(join(outputDir, "items.csv"), `${toReportCsv(items)}\n`);
  await writeFile(join(outputDir, "failures.csv"), `${toReportCsv(failures)}\n`);
  await writeFile(
    join(outputDir, "tenants.csv"),
    `${toCsv(tenants, ["tenant_id", "total_values", "migratable"])}\n`,
  );

  console.log(`dry-run report: ${outputDir}`);
  console.log(`total=${items.length}, migratable=${items.filter((item) => item.status === "migratable").length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
