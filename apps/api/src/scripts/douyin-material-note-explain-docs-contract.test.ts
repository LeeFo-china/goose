import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  MATERIAL_NOTE_EXPLAIN_CONFIRMATION,
  MATERIAL_NOTE_EXPLAIN_ENV,
  MATERIAL_NOTE_EXPLAIN_FIXTURE_TAG,
} from "./douyin-material-note-explain-config";
import {
  MATERIAL_NOTE_EXPLAIN_ERROR_CODES,
  MATERIAL_NOTE_EXPLAIN_MANIFEST,
  MATERIAL_NOTE_EXPLAIN_QUERY_NAMES,
  MATERIAL_NOTE_EXPLAIN_THRESHOLDS,
} from "./douyin-material-note-explain-evidence";

const runbook = readFileSync(new URL(
  "../../../../docs/runbooks/douyin-material-note-explain.md",
  import.meta.url,
), "utf8");
const runnerSource = readFileSync(new URL(
  "./douyin-material-note-explain.ts",
  import.meta.url,
), "utf8");

function runnerStableCodes(): string[] {
  const match = runnerSource.match(
    /const STABLE_ERROR_CODES = new Set<string>\(\[([\s\S]*?)\]\);/,
  );
  expect(match).not.toBeNull();
  const entries = (match?.[1] ?? "").matchAll(
    /"([A-Z][A-Z0-9_]*)"|\.\.\.MATERIAL_NOTE_EXPLAIN_ERROR_CODES/g,
  );
  return [...new Set([...entries].flatMap((entry) =>
    entry[1] ? [entry[1]] : [...MATERIAL_NOTE_EXPLAIN_ERROR_CODES]
  ))];
}

function row(name: typeof MATERIAL_NOTE_EXPLAIN_QUERY_NAMES[number]): string {
  const manifest = MATERIAL_NOTE_EXPLAIN_MANIFEST[name];
  const indexes = manifest.indexes.map((index) => `${index.name}:${index.relation}`)
    .join("、");
  return `| ${name} | ${manifest.primaryRelation} | ${indexes} |`;
}

describe("douyin material note EXPLAIN runbook", () => {
  test("documents the command, explicit config, and fixed fixture", () => {
    expect(runbook).toContain("bun run douyin:material-note:explain");
    expect(runbook).toContain(MATERIAL_NOTE_EXPLAIN_CONFIRMATION);
    expect(runbook).toContain(MATERIAL_NOTE_EXPLAIN_ENV.confirmation);
    expect(runbook).toContain(MATERIAL_NOTE_EXPLAIN_ENV.databaseUrl);
    expect(runbook).toContain(MATERIAL_NOTE_EXPLAIN_FIXTURE_TAG);
    expect(runbook).toContain("REPEATABLE READ READ ONLY");
  });

  test("maps all queries and approved index relations exactly", () => {
    for (const name of MATERIAL_NOTE_EXPLAIN_QUERY_NAMES) {
      expect(runbook.split(row(name))).toHaveLength(2);
    }
  });

  test("documents the exact thresholds and cardinality policy", () => {
    for (const value of [
      MATERIAL_NOTE_EXPLAIN_THRESHOLDS.statementTimeoutMs,
      MATERIAL_NOTE_EXPLAIN_THRESHOLDS.planningMs,
      MATERIAL_NOTE_EXPLAIN_THRESHOLDS.executionMs,
      MATERIAL_NOTE_EXPLAIN_THRESHOLDS.sharedReadBlocks,
    ]) {
      expect(runbook).toContain(value.toLocaleString("en-US"));
    }
    expect(runbook).toContain("1,000");
    expect(runbook).toContain("small");
    expect(runbook).toContain("large");
    expect(runbook).toContain("Seq Scan");
  });

  test("documents every stable error code exactly once in the error table", () => {
    const table = runbook.slice(
      runbook.indexOf("## 稳定错误码"),
      runbook.indexOf("## 输出与留存"),
    );
    for (const code of runnerStableCodes()) {
      expect(table.split(`| ${code} |`)).toHaveLength(2);
    }
    for (const workflowCode of [
      "INVALID_EVIDENCE_INPUT",
      "MIGRATION_HISTORY_MISMATCH",
      "OUTPUT_REDACTION_FAILED",
    ]) {
      expect(table.split(`| ${workflowCode} |`)).toHaveLength(2);
    }
  });

  test("prohibits fixture writes and sensitive evidence retention", () => {
    for (const phrase of [
      "不得通过 SQL 创建或修改 fixture",
      "不得保存或上传数据库 URL",
      "tenant/install/note/claim UUID",
      "subject hash",
      "原始 EXPLAIN JSON",
      "SQL bindings",
    ]) {
      expect(runbook).toContain(phrase);
    }
    expect(runbook).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
    expect(runbook).not.toMatch(/postgres(?:ql)?:\/\/\S+/i);
    expect(runbook).not.toMatch(/1[3-9][0-9]{9}/);
  });
});
