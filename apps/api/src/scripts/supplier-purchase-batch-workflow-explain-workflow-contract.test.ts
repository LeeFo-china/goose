import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL(
  "../../../../.github/workflows/verify-dev-supplier-purchase-workflow-explain.yml",
  import.meta.url,
), "utf8");

const SHELL_STEPS = [
  "Guard development runner and request",
  "Verify immutable checkout and deployed revision",
  "Install API workflow dependencies",
  "Verify development database target and migration history",
  "Download immutable source artifact",
  "Normalize workflow evidence input",
  "Run read-only workflow EXPLAIN",
  "Verify workflow EXPLAIN summary",
] as const;

const ORDERED_STEPS = [
  "Guard development runner and request",
  "Checkout verified commit",
  "Verify immutable checkout and deployed revision",
  "Set up Node",
  "Set up Bun",
  "Install API workflow dependencies",
  "Verify development database target and migration history",
  "Download immutable source artifact",
  "Normalize workflow evidence input",
  "Run read-only workflow EXPLAIN",
  "Verify workflow EXPLAIN summary",
  "Upload workflow EXPLAIN evidence",
] as const;

function occurrences(content: string, value: string): number {
  return content.split(value).length - 1;
}

function stepSource(content: string, name: string): string {
  const marker = `      - name: ${name}\n`;
  const start = content.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = content.indexOf("\n      - ", start + marker.length);
  return content.slice(start, next === -1 ? undefined : next);
}

function expectStepsInOrder(content: string): void {
  let previous = -1;
  for (const name of ORDERED_STEPS) {
    const current = content.indexOf(`      - name: ${name}\n`);
    expect(current).toBeGreaterThan(previous);
    previous = current;
  }
}

function expectRejectFunction(
  step: string,
  name: string,
  code: string,
  expectedCalls: number,
): void {
  expect(step).toContain([
    `${name}() {`,
    `            printf '%s\\n' "${code}" >&2`,
    "            exit 1",
    "          }",
  ].join("\n"));
  expect(occurrences(step, `${name}()`)).toBe(1);
  expect(occurrences(step, `            ${name}\n`)).toBe(expectedCalls);
}

function uploadPaths(step: string): string[] {
  const match = step.match(
    /          path: \|\n((?:            [^\n]+\n)+)          if-no-files-found:/,
  );
  expect(match).not.toBeNull();
  return (match?.[1] ?? "").trim().split("\n").map((line) => line.trim());
}

function assertWorkflowContract(content: string): void {
  expect(content).toContain([
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
  expect(content).toContain([
    "permissions:",
    "  contents: read",
    "  actions: read",
  ].join("\n"));
  expect(content).toContain([
    "concurrency:",
    "  group: verify-dev-supplier-purchase-workflow-explain",
    "  cancel-in-progress: false",
  ].join("\n"));
  expect(content).toContain([
    "  verify:",
    "    runs-on: [self-hosted, Linux, X64, gooes-dev-deploy]",
    "    environment: development",
    "    timeout-minutes: 20",
  ].join("\n"));

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
    "DISPATCH_REF: ${{ github.ref }}",
    "DISPATCH_SHA: ${{ github.sha }}",
  ]) {
    expect(content).toContain(entry);
  }

  expectStepsInOrder(content);
  expect(content.match(/^      - name:/gm)).toHaveLength(ORDERED_STEPS.length);
  for (const name of SHELL_STEPS) {
    expect(stepSource(content, name)).toContain("run: |\n          set -euo pipefail");
  }
  expect(content).not.toContain("|| true");
  expect(content).not.toContain("continue-on-error");
  expect(content).not.toMatch(/^\s+test\s/m);
  expect(content).not.toMatch(/enable[_ -]?seqscan\s*=\s*off/i);
  expect(content).not.toMatch(
    /(?:echo|printf)[^\n]*(?:SUPABASE_DB_DIRECT_URL|SUPABASE_DB_URL|DEV_DB_ENV_FILE)/,
  );

  const guard = stepSource(content, "Guard development runner and request");
  expectRejectFunction(guard, "reject_dev_target", "INVALID_DEV_TARGET", 1);
  expectRejectFunction(
    guard,
    "reject_confirmation",
    "CONFIRMATION_REQUIRED",
    1,
  );
  expect(guard).toContain('[[ "${CONFIRMATION:-}" != "development-read-only" ]]');
  expect(guard).toContain('[[ "${RUNNER_NAME:-}" != "gooes-dev-vm-0-11" ||');
  expect(guard).toContain('! -r "${DEV_DB_ENV_FILE:-}" ||');
  expect(guard).toContain('"${DISPATCH_REF:-}" != "refs/heads/main" ||');
  expect(guard).toContain('! "${COMMIT_SHA:-}" =~ ^[a-f0-9]{40}$ ||');
  expect(guard).toContain('"${COMMIT_SHA:-}" != "${DISPATCH_SHA:-}" ]]');

  expect(content).toContain("ref: ${{ inputs.commit_sha }}\n          clean: true");
  const immutable = stepSource(
    content,
    "Verify immutable checkout and deployed revision",
  );
  expectRejectFunction(immutable, "reject_dev_target", "INVALID_DEV_TARGET", 4);
  expect(immutable).toContain(
    'head_revision="$(git rev-parse HEAD 2>/dev/null)"',
  );
  expect(immutable).toContain(
    'workspace_status="$(git status --porcelain 2>/dev/null)"',
  );
  expect(immutable).toContain(
    'docker inspect -f \'{{index .Config.Labels "org.opencontainers.image.revision"}}\' gooes-api-dev 2>/dev/null',
  );
  expect(immutable).toContain(
    '[[ "${head_revision}" != "${COMMIT_SHA}" || -n "${workspace_status}" || "${deployed_revision}" != "${COMMIT_SHA}" ]]',
  );

  expect(content).toContain("uses: actions/setup-node@v6");
  expect(content).toContain('node-version: "22"');
  expect(content).toContain("package-manager-cache: false");
  expect(content).toContain("uses: oven-sh/setup-bun@v2");
  expect(content).toContain('bun-version: "1.3.2"');
  const install = stepSource(content, "Install API workflow dependencies");
  expect(install).toContain("corepack prepare pnpm@10.33.0 --activate");
  expect(install).toContain(
    "pnpm install --frozen-lockfile --filter @gooes/api... --filter @gooes/domain...",
  );

  const migration = stepSource(
    content,
    "Verify development database target and migration history",
  );
  expectRejectFunction(migration, "reject_dev_target", "INVALID_DEV_TARGET", 5);
  expectRejectFunction(
    migration,
    "reject_migration_history",
    "MIGRATION_HISTORY_MISMATCH",
    2,
  );
  expect(migration).toContain(
    "node scripts/validate-dev-database-target.mjs --direct-migration-history",
  );
  expect(migration).toContain(
    'pnpm dlx supabase@2.99.0 migration list --db-url "${SUPABASE_DB_DIRECT_URL}" > migration-history.txt 2>/dev/null',
  );
  expect(migration).toContain(
    "migration-history.txt supabase/migrations 20260830115000",
  );

  const download = stepSource(content, "Download immutable source artifact");
  expectRejectFunction(download, "reject_evidence", "INVALID_EVIDENCE_INPUT", 4);
  expect(download).toContain("GH_TOKEN: ${{ github.token }}");
  expect(download).toContain(
    'timeout --signal=TERM --kill-after=10s 120 gh run download "${SOURCE_RUN_ID}"',
  );
  expect(download).toContain('--repo "${GITHUB_REPOSITORY}"');
  expect(download).toContain('--name "${SOURCE_ARTIFACT_NAME}"');
  expect(download).toContain('>/dev/null 2>&1; then\n            reject_evidence');
  expect(download).toContain('! -f "${source_dir}/rollout-settings.json" ||');
  expect(download).toContain('! -f "${source_dir}/execute.json"');
  expect(download).toContain(
    'if ! { printf \'SOURCE_DIR=%s\\n\' "${source_dir}" >> "${GITHUB_ENV}"; } 2>/dev/null; then',
  );
  expect(occurrences(content, "GH_TOKEN:")).toBe(1);

  const normalize = stepSource(content, "Normalize workflow evidence input");
  expectRejectFunction(normalize, "reject_evidence", "INVALID_EVIDENCE_INPUT", 2);
  expect(normalize).toContain('"${SOURCE_DIR}/rollout-settings.json"');
  expect(normalize).toContain('"${SOURCE_DIR}/execute.json"');
  expect(normalize).toContain("tenantId: $rolloutSettings[0].tenant_id");
  expect(normalize).toContain("batchId: $execute[0].batchId");
  expect(normalize).toContain("instanceId: $execute[0].instanceId");
  expect(normalize).toContain(
    'test("^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")',
  );
  expect(normalize).toContain("if ! {\n            jq -en");
  expect(normalize).toContain(
    '> "${GITHUB_WORKSPACE}/workflow-explain-input.json"\n          } 2>/dev/null; then',
  );

  const run = stepSource(content, "Run read-only workflow EXPLAIN");
  expectRejectFunction(run, "reject_dev_target", "INVALID_DEV_TARGET", 4);
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
    "bun run --silent --cwd apps/api supplier:purchase-batch-workflow:explain",
  );
  expect(run).toContain('> "${GITHUB_WORKSPACE}/workflow-explain-summary.json"');

  const summary = stepSource(content, "Verify workflow EXPLAIN summary");
  expectRejectFunction(summary, "reject_evidence", "INVALID_EVIDENCE_INPUT", 1);
  expect(summary).toContain(
    '.gate == "supplier_purchase_batch_workflow" and .queryCount == 3 and (.queries | length) == 3',
  );
  expect(summary).toContain('>/dev/null 2>&1; then\n            reject_evidence');

  expect(occurrences(content, "uses: actions/upload-artifact@v6")).toBe(1);
  const upload = stepSource(content, "Upload workflow EXPLAIN evidence");
  expect(upload).toContain(
    "name: supplier-purchase-workflow-explain-${{ inputs.commit_sha }}",
  );
  expect(uploadPaths(upload)).toEqual([
    "workflow-explain-summary.json",
    "migration-evidence.json",
  ]);
  expect(upload).toContain("if-no-files-found: error");
  expect(upload).toContain("retention-days: 30");
  expect(upload).not.toMatch(
    /workflow-explain-input|raw|\.env|migration-history|[*?\[\]]/,
  );
}

function replaceOnce(content: string, from: string, to: string): string {
  const mutated = content.replace(from, to);
  expect(mutated).not.toBe(content);
  return mutated;
}

function removeOccurrence(
  content: string,
  value: string,
  occurrenceIndex: number,
): string {
  let start = -1;
  for (let index = 0; index <= occurrenceIndex; index += 1) {
    start = content.indexOf(value, start + 1);
  }
  expect(start).toBeGreaterThanOrEqual(0);
  return content.slice(0, start) + content.slice(start + value.length);
}

describe("protected development workflow EXPLAIN gate", () => {
  test("locks the complete protected workflow contract", () => {
    assertWorkflowContract(workflow);
  });

  test("rejects fail-open, identity, evidence, and upload mutations", () => {
    const rejectCallMutations = [
      "reject_dev_target",
      "reject_confirmation",
      "reject_migration_history",
      "reject_evidence",
    ].flatMap((name) => {
      const call = `            ${name}\n`;
      return Array.from(
        { length: occurrences(workflow, call) },
        (_, index) => removeOccurrence(workflow, call, index),
      );
    });
    const mutations = [
      replaceOnce(workflow, "set -euo pipefail", "set -euo pipefail || true"),
      replaceOnce(workflow, '"INVALID_DEV_TARGET"', '"UNSTABLE_TARGET"'),
      replaceOnce(workflow, '"CONFIRMATION_REQUIRED"', '"UNSTABLE_CONFIRM"'),
      replaceOnce(workflow, '"MIGRATION_HISTORY_MISMATCH"', '"UNSTABLE_MIGRATION"'),
      replaceOnce(workflow, '"INVALID_EVIDENCE_INPUT"', '"UNSTABLE_EVIDENCE"'),
      ...rejectCallMutations,
      `${workflow}\n      - uses: actions/upload-artifact@v6\n`,
      replaceOnce(workflow, "            migration-evidence.json", "            ."),
      replaceOnce(workflow, "            migration-evidence.json", "            *.json"),
      replaceOnce(
        workflow,
        "            migration-evidence.json",
        "            workflow-explain-input.json",
      ),
      replaceOnce(
        workflow,
        "            migration-evidence.json",
        "            raw-plans.json",
      ),
      replaceOnce(
        workflow,
        "            migration-evidence.json",
        "            /opt/gooes-dev/docker/.env.dev.db",
      ),
      `${workflow}\n` + '          GH_TOKEN: ${{ github.token }}\n',
      replaceOnce(workflow, ".tenant_id", ".tenant"),
      replaceOnce(workflow, ".batchId", ".batch"),
      replaceOnce(workflow, ".instanceId", ".instance"),
      replaceOnce(
        workflow,
        "bun run --silent --cwd apps/api supplier:purchase-batch-workflow:explain",
        "bun --cwd apps/api run --silent supplier:purchase-batch-workflow:explain",
      ),
      replaceOnce(
        workflow,
        "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
        "^[0-9a-f-]{36}$",
      ),
      replaceOnce(workflow, "DISPATCH_REF: ${{ github.ref }}", "DISPATCH_REF: refs/heads/main"),
      replaceOnce(workflow, "DISPATCH_SHA: ${{ github.sha }}", "DISPATCH_SHA: ${{ inputs.commit_sha }}"),
      replaceOnce(workflow, '"refs/heads/main"', '"refs/heads/"'),
      replaceOnce(
        workflow,
        '"${COMMIT_SHA:-}" != "${DISPATCH_SHA:-}"',
        '"${COMMIT_SHA:-}" != ""',
      ),
      replaceOnce(workflow, "gooes-api-dev 2>/dev/null", "unknown-api 2>/dev/null"),
      replaceOnce(workflow, '"${deployed_revision}" != "${COMMIT_SHA}"', '"${deployed_revision}" != ""'),
    ];
    for (const [index, mutated] of mutations.entries()) {
      try {
        assertWorkflowContract(mutated);
      } catch {
        continue;
      }
      throw new Error(`workflow mutation ${index} was accepted`);
    }
  });
});
