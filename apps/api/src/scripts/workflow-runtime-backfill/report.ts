import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { BackfillResult } from "./types";

export function summarizeResults(results: BackfillResult[]) {
  return results.reduce<Record<string, number>>((acc, item) => {
    const key = `${item.subject_type}.${item.action}${
      item.reason ? `.${item.reason}` : ""
    }`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function toMarkdownReport(input: {
  tenantId: string;
  apply: boolean;
  results: BackfillResult[];
}) {
  const summary = summarizeResults(input.results);
  const lines = [
    "# State Machine Runtime Backfill Report",
    "",
    `- tenant_id: ${input.tenantId}`,
    `- mode: ${input.apply ? "apply" : "dry-run"}`,
    `- generated_at: ${new Date().toISOString()}`,
    `- scanned: ${input.results.length}`,
    "",
    "## Summary",
    "",
    "| key | count |",
    "| --- | ---: |",
    ...Object.entries(summary)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, count]) => `| ${key} | ${count} |`),
    "",
    "## Skipped Or Failed Rows",
    "",
    "| subject_type | subject_id | status | step | workflow_key | node_key | action | reason |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...input.results
      .filter((item) => item.action === "skip" || item.action === "failed")
      .map((item) => [
        item.subject_type,
        item.subject_id,
        item.legacy_status ?? "",
        item.legacy_step ?? "",
        item.workflow_key,
        item.node_key ?? "",
        item.action,
        item.reason,
      ].map((value) => String(value).replace(/\|/g, "\\|")).join(" | "))
      .map((row) => `| ${row} |`),
    "",
  ];

  return `${lines.join("\n")}\n`;
}

export async function writeBackfillReport(input: {
  tenantId: string;
  apply: boolean;
  reportPath: string;
  results: BackfillResult[];
}) {
  await mkdir(dirname(input.reportPath), { recursive: true });
  await writeFile(input.reportPath, toMarkdownReport(input), "utf8");
  return input.reportPath;
}
