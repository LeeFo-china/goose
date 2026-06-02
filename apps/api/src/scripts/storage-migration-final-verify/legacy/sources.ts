import { SupabaseDB } from "@/utils/supabase";
import type { MigrationItem, SourceConfig } from "./types";

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

export function configFor(item: MigrationItem) {
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

export async function fetchSourceRow(table: string, id: string) {
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

export function readBusinessValue(input: {
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
