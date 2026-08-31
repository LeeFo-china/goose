import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  WORKFLOW_EXPLAIN_CONFIRMATION,
  WORKFLOW_EXPLAIN_ENV,
  WORKFLOW_EXPLAIN_SOURCE,
} from "./supplier-purchase-batch-workflow-explain-config";
import {
  WORKFLOW_EXPLAIN_ERROR_CODES,
  WORKFLOW_EXPLAIN_MANIFEST,
  WORKFLOW_EXPLAIN_THRESHOLDS,
} from "./supplier-purchase-batch-workflow-explain-evidence";

const packageJson = JSON.parse(readFileSync(
  new URL("../../package.json", import.meta.url),
  "utf8",
)) as { scripts?: Record<string, string> };
const runbook = readFileSync(new URL(
  "../../../../docs/runbooks/supplier-purchase-batch-workflow-release.md",
  import.meta.url,
), "utf8");

const SCRIPT_NAME = "supplier:purchase-batch-workflow:explain";

describe("supplier purchase batch workflow EXPLAIN documentation", () => {
  test("publishes the fixed API package command", () => {
    expect(packageJson.scripts?.[SCRIPT_NAME]).toBe(
      "bun src/scripts/supplier-purchase-batch-workflow-explain.ts",
    );
    expect(runbook).toContain(`bun run ${SCRIPT_NAME}`);
  });

  test("locks the environment and immutable source artifact", () => {
    for (const value of [
      ...Object.values(WORKFLOW_EXPLAIN_ENV),
      WORKFLOW_EXPLAIN_CONFIRMATION,
      WORKFLOW_EXPLAIN_SOURCE.sourceRunId,
      WORKFLOW_EXPLAIN_SOURCE.artifactName,
    ]) {
      expect(runbook).toContain(value);
    }
  });

  test("locks the three query and approved index mappings", () => {
    for (const value of [
      "running_instance",
      ...WORKFLOW_EXPLAIN_MANIFEST.running_instance.indexes,
      "pending_task",
      ...WORKFLOW_EXPLAIN_MANIFEST.pending_task.indexes,
      "subject_state",
      ...WORKFLOW_EXPLAIN_MANIFEST.subject_state.indexes,
    ]) {
      expect(runbook).toContain(value);
    }
  });

  test("documents the cardinality classes and common limits", () => {
    for (const value of [
      "cardinality < 1,000",
      "cardinality >= 1,000",
      `planning time <= ${WORKFLOW_EXPLAIN_THRESHOLDS.planningMs}ms`,
      `execution time <= ${WORKFLOW_EXPLAIN_THRESHOLDS.executionMs}ms`,
      "shared read blocks <= 20,000",
      "temp blocks = 0",
      "statement timeout = 5,000ms",
      "REPEATABLE READ READ ONLY",
    ]) {
      expect(runbook).toContain(value);
    }
    expect(runbook).toContain("small 表允许目标表出现 `Seq Scan`");
    expect(runbook).toContain("large 表禁止目标表出现 `Seq Scan`");
    expect(runbook).toContain("必须命中批准索引");
    expect(runbook).toContain("索引元数据");
  });

  test("publishes stable failures without exposing raw plans", () => {
    for (const code of [
      "CONFIRMATION_REQUIRED",
      "MISSING_CONFIG",
      "INVALID_DATABASE_URL",
      "INVALID_EVIDENCE_INPUT",
      ...WORKFLOW_EXPLAIN_ERROR_CODES,
      "TRANSACTION_GUARD_INVALID",
      "INVALID_DEV_TARGET",
      "STATEMENT_TIMEOUT",
      "DATABASE_FAILURE",
      "DATABASE_CLOSE_FAILED",
    ]) {
      expect(runbook).toContain(code);
    }
    expect(runbook).toContain(
      "SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_FAILED:<CODE>",
    );
  });

  test("keeps clone evidence and client contracts outside the dev gate", () => {
    expect(runbook).toContain("enable_seqscan=off");
    expect(runbook).toContain("仅用于结构性验证");
    expect(runbook).toContain("不能作为 dev 性能验收证据");
    expect(runbook).toContain("不修改 Orange");
    expect(runbook).toContain("不调整 API 契约");
  });
});
