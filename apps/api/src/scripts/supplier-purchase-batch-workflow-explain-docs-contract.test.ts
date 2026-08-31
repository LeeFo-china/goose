import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  WORKFLOW_EXPLAIN_CONFIRMATION,
  WORKFLOW_EXPLAIN_ENV,
  WORKFLOW_EXPLAIN_SOURCE,
} from "./supplier-purchase-batch-workflow-explain-config";
import {
  WORKFLOW_EXPLAIN_CARDINALITY_LIMIT,
  WORKFLOW_EXPLAIN_ERROR_CODES,
  WORKFLOW_EXPLAIN_MANIFEST,
  WORKFLOW_EXPLAIN_QUERY_NAMES,
  WORKFLOW_EXPLAIN_THRESHOLDS,
  type WorkflowExplainQueryName,
} from "./supplier-purchase-batch-workflow-explain-evidence";

const packageJson = JSON.parse(readFileSync(
  new URL("../../package.json", import.meta.url),
  "utf8",
)) as { scripts?: Record<string, string> };
const runbook = readFileSync(new URL(
  "../../../../docs/runbooks/supplier-purchase-batch-workflow-release.md",
  import.meta.url,
), "utf8");
const configSource = readFileSync(new URL(
  "./supplier-purchase-batch-workflow-explain-config.ts",
  import.meta.url,
), "utf8");
const runnerSource = readFileSync(new URL(
  "./supplier-purchase-batch-workflow-explain.ts",
  import.meta.url,
), "utf8");
const devWorkflow = readFileSync(new URL(
  "../../../../.github/workflows/verify-dev-supplier-purchase-workflow-explain.yml",
  import.meta.url,
), "utf8");

const SCRIPT_NAME = "supplier:purchase-batch-workflow:explain";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizePolicyText(value: string): string {
  return normalizeWhitespace(value)
    .replace(/、\s*/g, "、")
    .replace(/，以及\s*/g, "，以及");
}

function formatPolicyNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function markdownRows(content: string): string[] {
  return content.split("\n")
    .map(normalizeWhitespace)
    .filter((line) => line.startsWith("|") && line.endsWith("|"));
}

function expectedQueryRow(name: WorkflowExplainQueryName): string {
  const entry = WORKFLOW_EXPLAIN_MANIFEST[name];
  const indexes = entry.indexes.map((index) => `\`${index}\``).join("、");
  return `| \`${name}\` | \`${entry.relation}\` | ${indexes} |`;
}

function assertQueryMappingContract(content: string): void {
  const rows = markdownRows(content);
  for (const name of WORKFLOW_EXPLAIN_QUERY_NAMES) {
    expect(rows.filter((row) => row === expectedQueryRow(name))).toHaveLength(1);
  }
}

function expectedCardinalityRows(): string[] {
  const limit = formatPolicyNumber(WORKFLOW_EXPLAIN_CARDINALITY_LIMIT);
  return [
    `| \`cardinality < ${limit}\`（small） | small 表允许目标表出现 \`Seq Scan\` 或批准索引；共同阈值内且索引元数据有效 | 通过 |`,
    `| \`cardinality >= ${limit}\`（large） | large 表禁止目标表出现 \`Seq Scan\`，且必须命中批准索引 | 通过 |`,
  ];
}

function expectedThresholdText(): string {
  const thresholds = WORKFLOW_EXPLAIN_THRESHOLDS;
  return [
    `共同阈值的精确定义为：\`planning time <= ${formatPolicyNumber(thresholds.planningMs)}ms\`、`,
    `\`execution time <= ${formatPolicyNumber(thresholds.executionMs)}ms\`、`,
    `\`shared read blocks <= ${formatPolicyNumber(thresholds.sharedReadBlocks)}\`、`,
    `\`temp blocks = ${formatPolicyNumber(thresholds.tempBlocks)}\`（read 和 written 均为 ${formatPolicyNumber(thresholds.tempBlocks)}），以及`,
    `\`statement timeout = ${formatPolicyNumber(thresholds.statementTimeoutMs)}ms\`。`,
  ].join("");
}

function expectedThresholdFailureRow(): string {
  const thresholds = WORKFLOW_EXPLAIN_THRESHOLDS;
  return `| 任意 | planning \`> ${formatPolicyNumber(thresholds.planningMs)}ms\`、execution \`> ${formatPolicyNumber(thresholds.executionMs)}ms\`、shared read \`> ${formatPolicyNumber(thresholds.sharedReadBlocks)}\`、temp blocks \`> ${formatPolicyNumber(thresholds.tempBlocks)}\` | 失败 |`;
}

function assertCardinalityAndThresholdContract(content: string): void {
  const rows = markdownRows(content);
  for (const row of expectedCardinalityRows()) {
    expect(rows.filter((candidate) => candidate === row)).toHaveLength(1);
  }
  expect(rows.filter((row) => row === expectedThresholdFailureRow()))
    .toHaveLength(1);
  expect(normalizePolicyText(content)).toContain(expectedThresholdText());
}

function runnerStableErrorCodes(): string[] {
  const match = runnerSource.match(
    /const STABLE_ERROR_CODES = new Set<string>\(\[([\s\S]*?)\]\);/,
  );
  expect(match).not.toBeNull();
  const allowlist = match?.[1] ?? "";
  const entries = allowlist.matchAll(
    /"([A-Z][A-Z0-9_]*)"|\.\.\.WORKFLOW_EXPLAIN_ERROR_CODES/g,
  );
  const codes = [...entries].flatMap((entry) =>
    entry[1] ? [entry[1]] : [...WORKFLOW_EXPLAIN_ERROR_CODES]
  );
  return [...new Set(codes)];
}

function configFailureCodes(): string[] {
  return [...configSource.matchAll(/fail\(\s*"([A-Z][A-Z0-9_]*)"/g)]
    .flatMap((entry) => typeof entry[1] === "string" ? [entry[1]] : []);
}

function documentedStableErrorCodes(content: string): string[] {
  const normalized = normalizeWhitespace(content);
  const match = normalized.match(
    /稳定 failure codes 固定为：(.*?)。门禁成功只保存脱敏 summary/,
  );
  expect(match).not.toBeNull();
  const section = match?.[1] ?? "";
  return [...section.matchAll(/`([A-Z][A-Z0-9_]*)`/g)]
    .flatMap((entry) => typeof entry[1] === "string" ? [entry[1]] : []);
}

function assertStableErrorContract(content: string): void {
  const runnerCodes = runnerStableErrorCodes();
  expect(documentedStableErrorCodes(content)).toEqual(runnerCodes);
  for (const configCode of new Set(configFailureCodes())) {
    expect(runnerCodes).toContain(configCode);
  }
}

function assertSensitiveEvidenceContract(content: string): void {
  for (const sourceKey of ["tenantId", "batchId", "instanceId"] as const) {
    expect(content).not.toContain(WORKFLOW_EXPLAIN_SOURCE[sourceKey]);
  }
  expect(content).not.toMatch(/postgres(?:ql)?:\/\/[^\s/@:]+:[^\s/@]+@/i);
  expect(content).not.toMatch(
    /(?:where|and)\s+(?:tenant_id|subject_type|subject_id|instance_id)\s*=/i,
  );
  expect(normalizeWhitespace(content)).toContain(
    "不得保存或上传数据库 URL、归一化 UUID 输入或原始 EXPLAIN JSON",
  );
  const withoutSafetyStatements = content.replace(
    /[^。]*不得[^。]*(?:原始 predicate|raw EXPLAIN JSON|原始 EXPLAIN JSON)[^。]*。/gi,
    "",
  );
  expect(withoutSafetyStatements).not.toMatch(
    /(?:展示|打印|输出|保存|上传)[^。\n]{0,80}(?:原始 predicate|raw EXPLAIN JSON|原始 EXPLAIN JSON)/i,
  );
}

function assertRunbookGateContract(content: string): void {
  assertQueryMappingContract(content);
  assertCardinalityAndThresholdContract(content);
  assertStableErrorContract(content);
  assertSensitiveEvidenceContract(content);
}

function replaceOnce(content: string, from: string, to: string): string {
  const mutated = content.replace(from, to);
  expect(mutated).not.toBe(content);
  return mutated;
}

function workflowStep(name: string): string {
  const marker = `      - name: ${name}\n`;
  const start = devWorkflow.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = devWorkflow.indexOf("\n      - ", start + marker.length);
  return devWorkflow.slice(start, next === -1 ? undefined : next);
}

function expectWorkflowStepsInOrder(names: string[]): void {
  let previousIndex = -1;
  for (const name of names) {
    const index = devWorkflow.indexOf(`      - name: ${name}\n`);
    expect(index).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
}

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
    expect(runbook).toContain("REPEATABLE READ READ ONLY");
  });

  test("binds each query to its relation and approved indexes", () => {
    assertQueryMappingContract(runbook);
  });

  test("binds small and large semantics to authoritative policy constants", () => {
    assertCardinalityAndThresholdContract(runbook);
  });

  test("matches the runner stable error allowlist exactly and in order", () => {
    assertStableErrorContract(runbook);
    expect(runbook).toContain(
      "SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_FAILED:<CODE>",
    );
  });

  test("excludes sensitive fixed evidence and raw database evidence", () => {
    assertSensitiveEvidenceContract(runbook);
  });

  test("rejects policy mutations that preserve the old token bag", () => {
    const limit = formatPolicyNumber(WORKFLOW_EXPLAIN_CARDINALITY_LIMIT);
    const planningMs = formatPolicyNumber(
      WORKFLOW_EXPLAIN_THRESHOLDS.planningMs,
    );
    const mutations = [
      replaceOnce(
        runbook,
        "| `running_instance` | `workflow_instances` |",
        "| `running_instance` | `workflow_tasks` |",
      ),
      replaceOnce(
        runbook,
        `\`cardinality < ${limit}\`（small） | small 表允许`,
        `\`cardinality < ${limit}\`（small） | small 表禁止`,
      ),
      replaceOnce(
        runbook,
        `\`cardinality >= ${limit}\`（large） | large 表禁止`,
        `\`cardinality >= ${limit}\`（large） | large 表允许`,
      ),
      replaceOnce(
        runbook,
        `planning time <= ${planningMs}ms`,
        `planning time <= ${formatPolicyNumber(WORKFLOW_EXPLAIN_THRESHOLDS.planningMs + 1)}ms`,
      ),
      replaceOnce(
        runbook,
        "`CONFIRMATION_REQUIRED`、`MISSING_CONFIG`",
        "`MISSING_CONFIG`、`CONFIRMATION_REQUIRED`",
      ),
      replaceOnce(
        runbook,
        "`DATABASE_CLOSE_FAILED`。门禁成功",
        "`DATABASE_CLOSE_FAILED`、`UNREVIEWED_FAILURE`。门禁成功",
      ),
      `${runbook}\n${WORKFLOW_EXPLAIN_SOURCE.tenantId}`,
      `${runbook}\npostgres://user:pass@dev.example.invalid/postgres`,
      `${runbook}\nWHERE tenant_id = $1::uuid AND subject_id = $2::text`,
      `${runbook}\n展示并上传 raw EXPLAIN JSON。`,
    ];
    for (const mutated of mutations) {
      expect(() => assertRunbookGateContract(mutated)).toThrow();
    }
  });

  test("keeps clone evidence and client contracts outside the dev gate", () => {
    expect(runbook).toContain("enable_seqscan=off");
    expect(runbook).toContain("仅用于结构性验证");
    expect(runbook).toContain("不能作为 dev 性能验收证据");
    expect(runbook).toContain("不修改 Orange");
    expect(runbook).toContain("不调整 API 契约");
  });
});

describe("protected development workflow EXPLAIN gate", () => {
  test("locks manual inputs, permissions, concurrency, and the dev job", () => {
    expect(devWorkflow).toContain([
      "on:",
      "  workflow_dispatch:",
      "    inputs:",
      "      commit_sha:",
      "        required: true",
      "        type: string",
      "      confirmation:",
      "        required: true",
      "        type: string",
    ].join("\n"));
    expect(devWorkflow).toContain([
      "permissions:",
      "  contents: read",
      "  actions: read",
    ].join("\n"));
    expect(devWorkflow).toContain([
      "concurrency:",
      "  group: verify-dev-supplier-purchase-workflow-explain",
      "  cancel-in-progress: false",
    ].join("\n"));
    expect(devWorkflow).toContain([
      "  verify:",
      "    runs-on: [self-hosted, Linux, X64, gooes-dev-deploy]",
      "    environment: development",
      "    timeout-minutes: 20",
    ].join("\n"));
  });

  test("locks immutable source, development target, and request inputs", () => {
    for (const entry of [
      "SOURCE_RUN_ID: \"33359680214\"",
      "SOURCE_ARTIFACT_NAME: supplier-purchase-workflow-acceptance-9d02854a88d5ca83a2f883b923de1ffcd7d49bd3",
      "DEV_DB_ENV_FILE: /opt/gooes-dev/docker/.env.dev.db",
      "DEV_PROJECT_REF: fclnkyatvfvmzgzdqlba",
      "DEV_DB_HOST: api-dev.goodcms.cn",
      "BLOCKED_PROJECT_REFS: unqhypivjkpwldhufpjc",
      "BLOCKED_DB_HOSTS: api.goodcms.cn 1.13.20.39",
      "COMMIT_SHA: ${{ inputs.commit_sha }}",
      "CONFIRMATION: ${{ inputs.confirmation }}",
    ]) {
      expect(devWorkflow).toContain(entry);
    }
    const guard = workflowStep("Guard development runner and request");
    expect(guard).toContain('test "${RUNNER_NAME}" = "gooes-dev-vm-0-11"');
    expect(guard).toContain('test -r "${DEV_DB_ENV_FILE}"');
    expect(guard).toContain('test "${CONFIRMATION}" = "development-read-only"');
    expect(guard).toContain('[[ "${COMMIT_SHA}" =~ ^[a-f0-9]{40}$ ]]');
    expect(devWorkflow).toContain("ref: ${{ inputs.commit_sha }}\n          clean: true");
    expect(workflowStep("Verify immutable checkout")).toContain(
      'test "$(git rev-parse HEAD)" = "${COMMIT_SHA}"',
    );
  });

  test("uses the repository toolchain and frozen API workspace install", () => {
    expect(devWorkflow).toContain("uses: actions/setup-node@v6");
    expect(devWorkflow).toContain('node-version: "22"');
    expect(devWorkflow).toContain("package-manager-cache: false");
    expect(devWorkflow).toContain("uses: oven-sh/setup-bun@v2");
    expect(devWorkflow).toContain('bun-version: "1.3.2"');
    const install = workflowStep("Install API workflow dependencies");
    expect(install).toContain("corepack prepare pnpm@10.33.0 --activate");
    expect(install).toContain(
      "pnpm install --frozen-lockfile --filter @gooes/api... --filter @gooes/domain...",
    );
  });

  test("fails closed around the direct dev target and migration history", () => {
    const migration = workflowStep(
      "Verify development database target and migration history",
    );
    expect(migration).toContain(
      'node scripts/validate-dev-database-target.mjs --resolve-project-ref',
    );
    expect(migration).toContain(
      "node scripts/validate-dev-database-target.mjs --direct-migration-history",
    );
    expect(migration).toContain(
      'pnpm dlx supabase@2.99.0 migration list --db-url "${SUPABASE_DB_DIRECT_URL}" > migration-history.txt',
    );
    expect(migration).toContain(
      "migration-history.txt supabase/migrations 20260830115000",
    );
    expect(migration).toContain('printf \'%s\\n\' "INVALID_DEV_TARGET" >&2');
    expect(migration).toContain(
      'printf \'%s\\n\' "MIGRATION_HISTORY_MISMATCH" >&2',
    );
    expect(devWorkflow).not.toMatch(
      /(?:echo|printf)[^\n]*(?:SUPABASE_DB_DIRECT_URL|SUPABASE_DB_URL|DEV_DB_ENV_FILE)/,
    );
  });

  test("downloads and normalizes only the immutable source artifact", () => {
    const download = workflowStep("Download immutable source artifact");
    expect(download).toContain("GH_TOKEN: ${{ github.token }}");
    expect(download).toContain(
      'timeout --signal=TERM --kill-after=10s 120 gh run download "${SOURCE_RUN_ID}"',
    );
    expect(download).toContain('--repo "${GITHUB_REPOSITORY}"');
    expect(download).toContain('--name "${SOURCE_ARTIFACT_NAME}"');
    expect(download).toContain('mktemp -d "${RUNNER_TEMP}/supplier-purchase-workflow-source.XXXXXX"');
    expect(devWorkflow.match(/GH_TOKEN:/g)).toHaveLength(1);

    const normalize = workflowStep("Normalize workflow evidence input");
    expect(normalize).toContain('"${SOURCE_DIR}/rollout-settings.json"');
    expect(normalize).toContain('"${SOURCE_DIR}/execute.json"');
    expect(normalize).toContain(".tenant_id");
    expect(normalize).toContain(".batchId");
    expect(normalize).toContain(".instanceId");
    expect(normalize).toContain('> "${GITHUB_WORKSPACE}/workflow-explain-input.json"');
  });

  test("runs the package gate with exact env and uploads only summaries", () => {
    const run = workflowStep("Run read-only workflow EXPLAIN");
    expect(run).toContain(
      'SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_CONFIRM="${CONFIRMATION}"',
    );
    expect(run).toContain(
      'SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_DB_URL="${SUPABASE_DB_DIRECT_URL}"',
    );
    expect(run).toContain(
      'SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_EVIDENCE_FILE="${GITHUB_WORKSPACE}/workflow-explain-input.json"',
    );
    expect(run).toContain(
      "bun --cwd apps/api run supplier:purchase-batch-workflow:explain",
    );
    expect(run).toContain('> "${GITHUB_WORKSPACE}/workflow-explain-summary.json"');
    expect(workflowStep("Verify workflow EXPLAIN summary")).toContain(
      '.gate == "supplier_purchase_batch_workflow" and .queryCount == 3 and (.queries | length) == 3',
    );

    const upload = workflowStep("Upload workflow EXPLAIN evidence");
    expect(upload).toContain("uses: actions/upload-artifact@v6");
    expect(upload).toContain(
      "name: supplier-purchase-workflow-explain-${{ inputs.commit_sha }}",
    );
    expect(upload).toContain([
      "path: |",
      "            workflow-explain-summary.json",
      "            migration-evidence.json",
      "          if-no-files-found: error",
      "          retention-days: 30",
    ].join("\n"));
    expect(upload).not.toMatch(/workflow-explain-input|raw|\.env|migration-history/);
  });

  test("keeps security-sensitive steps ordered and excludes clone evidence", () => {
    expectWorkflowStepsInOrder([
      "Guard development runner and request",
      "Checkout verified commit",
      "Verify immutable checkout",
      "Install API workflow dependencies",
      "Verify development database target and migration history",
      "Download immutable source artifact",
      "Normalize workflow evidence input",
      "Run read-only workflow EXPLAIN",
      "Verify workflow EXPLAIN summary",
      "Upload workflow EXPLAIN evidence",
    ]);
    expect(devWorkflow).not.toMatch(/enable[_ -]?seqscan\s*=\s*off/i);
    expect(devWorkflow).not.toMatch(/path:[^\n]*(?:workflow-explain-input|raw|\.env)/i);
  });
});
