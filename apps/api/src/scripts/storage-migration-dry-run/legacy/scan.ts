import { SupabaseDB } from "@/utils/supabase";
import { buildTargetObjectKey, normalizeString } from "./shared";
import type { CliOptions, ReportItem, SourceConfig } from "./shared";
import { checkRemoteSize, classifyValue } from "./classification";

export async function scanSource(
  source: SourceConfig,
  options: CliOptions,
  remaining: number,
) {
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

export function summarize(items: ReportItem[], startedAt: string) {
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
