import { createHash } from "node:crypto";
import { SupabaseDB } from "@/utils/supabase";

export type CliOptions = {
  tenantId: string | null;
  allTenants: boolean;
  limit: number;
  outDir: string;
  checkRemote: boolean;
};

export type SourceConfig = {
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

export type ReportItem = {
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

export const LEGACY_BUCKET = "project-logs";
export const COS_PREFIXES = ["tenants/", "public/", "system/"];

export function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export function isCosObjectKey(value: string) {
  return COS_PREFIXES.some((prefix) => value.replace(/^\/+/, "").startsWith(prefix));
}

export function getCosPublicHost() {
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

export function getExtension(value: string) {
  const cleanValue = value.split("?")[0] || value;
  const matched = cleanValue.match(/\.([a-zA-Z0-9]{1,8})$/);
  return matched?.[1]?.toLowerCase() || "bin";
}

export function buildTargetObjectKey(input: {
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

export function legacyPathToPublicUrl(path: string) {
  return SupabaseDB.getAdminClient()
    .storage
    .from(LEGACY_BUCKET)
    .getPublicUrl(path)
    .data.publicUrl;
}
