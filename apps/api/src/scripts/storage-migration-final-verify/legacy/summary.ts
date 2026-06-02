import type { VerifyResult } from "./types";

export function summarize(items: VerifyResult[], startedAt: string) {
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
