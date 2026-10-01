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

export function summarizeResultsByLegacyStatus(results: BackfillResult[]) {
  return results.reduce<Record<string, number>>((acc, item) => {
    const key = `${item.subject_type}.${item.legacy_status ?? "null"}.${item.action}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

export function renderBackfillReport(input: {
  tenantId: string;
  apply: boolean;
  generatedAt: string;
  createdBefore: string | null;
  results: BackfillResult[];
}) {
  const summary = summarizeResults(input.results);
  const statusSummary = summarizeResultsByLegacyStatus(input.results);
  const lines = [
    "# State Machine Runtime Backfill Report",
    "",
    `- tenant_id: ${input.tenantId}`,
    `- mode: ${input.apply ? "apply" : "dry-run"}`,
    `- generated_at: ${input.generatedAt}`,
    `- created_before: ${input.createdBefore ?? ""}`,
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
    "## Status Summary",
    "",
    "| subject_type.status.action | count |",
    "| --- | ---: |",
    ...Object.entries(statusSummary)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, count]) => `| ${key} | ${count} |`),
    "",
    "## Planned Rows",
    "",
    "| subject_type | subject_id | status | node_key | task_created |",
    "| --- | --- | --- | --- | --- |",
    ...input.results
      .filter((item) => item.action === "dry_run_create")
      .map((item) => [
        item.subject_type,
        item.subject_id,
        item.legacy_status ?? "",
        item.node_key ?? "",
        item.task_created,
      ].map((value) => String(value).replace(/\|/g, "\\|")).join(" | "))
      .map((row) => `| ${row} |`),
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
  generatedAt: string;
  createdBefore: string | null;
  reportPath: string;
  results: BackfillResult[];
}) {
  await mkdir(dirname(input.reportPath), { recursive: true });
  await writeFile(input.reportPath, renderBackfillReport(input), "utf8");
  return input.reportPath;
}
