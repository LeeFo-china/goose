import type { MigrationResult } from "./types";

export function summarize(items: MigrationResult[], startedAt: string, apply: boolean) {
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
