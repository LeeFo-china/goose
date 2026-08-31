# Supplier Purchase Workflow EXPLAIN Cardinality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the temporary “reject every Seq Scan” check with a permanent protected dev EXPLAIN gate that accepts efficient small-table planner choices and requires approved indexes at 1,000 rows or more.

**Architecture:** A strict config module authenticates the fixed prior smoke artifact. A pure evidence module parses PostgreSQL JSON plans and applies deterministic cardinality, index, planner, timing, and buffer rules; a separate runner owns the single read-only repeatable-read database transaction. A workflow-dispatch gate validates the dev target and migration history, downloads the immutable source artifact, runs the gate, and uploads only normalized evidence.

**2026-09-01 dev baseline correction:** Protected run `33418391961` proved that dev sets
`effective_cache_size` from the cluster configuration file (`16384` versus boot value `524288`).
The permanent gate therefore accepts only this registered managed override, rejects all other
boot-value drift and transient `session/client` sources, and compares EXPLAIN Settings with
`current_setting(name)` so PostgreSQL unit formatting remains canonical.
Protected runs `33421831850` and `33422018634` further proved that EXPLAIN reports the dev role's
exact `search_path` (`"\$user", public, extensions`, source `user`); the gate registers that exact
role baseline instead of ignoring an unrecognized EXPLAIN setting.

**Tech Stack:** Bun 1.3.2, TypeScript 5, Bun SQL/PostgreSQL, Bun test, GitHub Actions, Supabase CLI 2.99.0, shell/jq.

---

## File map

- Create `apps/api/src/scripts/supplier-purchase-batch-workflow-explain-config.ts`: confirmation, environment, fixed artifact manifest, normalized evidence parsing, stable error class.
- Create `apps/api/src/scripts/supplier-purchase-batch-workflow-explain-config.test.ts`: exact artifact and fail-closed config tests.
- Create `apps/api/src/scripts/supplier-purchase-batch-workflow-explain-evidence.ts`: thresholds, query/index manifest, JSON plan parser, cardinality classifier, stable gate assertions.
- Create `apps/api/src/scripts/supplier-purchase-batch-workflow-explain-evidence.test.ts`: small/large, direct/bitmap/seq, Settings, buffer, metadata, and first-error tests.
- Create `apps/api/src/scripts/supplier-purchase-batch-workflow-explain.ts`: exact SQL, one-transaction orchestration, sanitized CLI output.
- Create `apps/api/src/scripts/supplier-purchase-batch-workflow-explain.test.ts`: SQL shape, transaction ordering, timeout mapping, and output redaction tests.
- Modify `apps/api/package.json`: add one runnable script.
- Create `.github/workflows/verify-dev-supplier-purchase-workflow-explain.yml`: protected dev runner and artifact production.
- Create `apps/api/src/scripts/supplier-purchase-batch-workflow-explain-docs-contract.test.ts`: package, workflow, runbook, and design contract.
- Modify `docs/runbooks/supplier-purchase-batch-workflow-release.md`: permanent cardinality-aware EXPLAIN procedure.
- Modify `docs/operations/evidence/2026-08-30-supplier-purchase-batch-workflow-dev.md`: final run/commit and normalized results after execution.

No migration, API route, service, repository, domain type, Admin, or Orange file changes are part of this plan.

## Task 1: Lock the fixed evidence and config contract

**Files:**
- Create: `apps/api/src/scripts/supplier-purchase-batch-workflow-explain-config.test.ts`
- Create: `apps/api/src/scripts/supplier-purchase-batch-workflow-explain-config.ts`

- [ ] **Step 1: Write the failing config tests**

```ts
import { describe, expect, test } from "bun:test";
import {
  WORKFLOW_EXPLAIN_CONFIRMATION,
  WORKFLOW_EXPLAIN_SOURCE,
  parseWorkflowExplainConfig,
  parseWorkflowExplainEvidenceInput,
} from "./supplier-purchase-batch-workflow-explain-config";

const INPUT = {
  sourceRunId: "33359680214",
  artifactName:
    "supplier-purchase-workflow-acceptance-9d02854a88d5ca83a2f883b923de1ffcd7d49bd3",
  tenantId: "3eebca47-961f-4899-b976-a3d3208d326b",
  batchId: "53298aa5-a3f6-45c3-8820-4cbfa15abfdb",
  instanceId: "158649b4-c356-4b04-abb4-d1d1b65f08d5",
};

describe("supplier purchase workflow EXPLAIN config", () => {
  test("accepts only the immutable source artifact tuple", () => {
    expect(parseWorkflowExplainEvidenceInput(INPUT)).toEqual(INPUT);
    expect(WORKFLOW_EXPLAIN_SOURCE).toEqual(INPUT);
    for (const key of Object.keys(INPUT) as (keyof typeof INPUT)[]) {
      expect(() => parseWorkflowExplainEvidenceInput({
        ...INPUT,
        [key]: key.endsWith("Id")
          ? "00000000-0000-4000-8000-000000000000"
          : "other",
      })).toThrow();
    }
    expect(() => parseWorkflowExplainEvidenceInput({
      ...INPUT,
      tenant_id: INPUT.tenantId,
    })).toThrow();
  });

  test("requires confirmation, database URL, and evidence file", () => {
    expect(parseWorkflowExplainConfig({
      SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_CONFIRM: WORKFLOW_EXPLAIN_CONFIRMATION,
      SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_DB_URL:
        "postgresql://reader:secret@dev.example.test/gooes",
      SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_EVIDENCE_FILE: "/tmp/evidence.json",
    })).toEqual({
      databaseUrl: "postgresql://reader:secret@dev.example.test/gooes",
      evidenceFile: "/tmp/evidence.json",
    });
    expect(() => parseWorkflowExplainConfig({})).toThrow();
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
cd apps/api && bun test src/scripts/supplier-purchase-batch-workflow-explain-config.test.ts
```

Expected: FAIL because the config module does not exist.

- [ ] **Step 3: Implement strict config parsing**

Create the module with these public contracts and manual strict-object validation; do not add a dependency:

```ts
export const WORKFLOW_EXPLAIN_CONFIRMATION = "development-read-only";
export const WORKFLOW_EXPLAIN_SOURCE = {
  sourceRunId: "33359680214",
  artifactName:
    "supplier-purchase-workflow-acceptance-9d02854a88d5ca83a2f883b923de1ffcd7d49bd3",
  tenantId: "3eebca47-961f-4899-b976-a3d3208d326b",
  batchId: "53298aa5-a3f6-45c3-8820-4cbfa15abfdb",
  instanceId: "158649b4-c356-4b04-abb4-d1d1b65f08d5",
} as const;
export const WORKFLOW_EXPLAIN_ENV = {
  confirmation: "SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_CONFIRM",
  databaseUrl: "SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_DB_URL",
  evidenceFile: "SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_EVIDENCE_FILE",
} as const;

export class WorkflowExplainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "WorkflowExplainError";
  }
}
export type WorkflowExplainEvidenceInput = typeof WORKFLOW_EXPLAIN_SOURCE;
export type WorkflowExplainConfig = { databaseUrl: string; evidenceFile: string };
```

`parseWorkflowExplainEvidenceInput(value)` must reject arrays, non-objects, missing/extra keys, aliases, and every value not exactly equal to `WORKFLOW_EXPLAIN_SOURCE`, returning `INVALID_EVIDENCE_INPUT`. `parseWorkflowExplainConfig(env)` must require the exact confirmation, an explicit `postgres:`/`postgresql:` URL with host/database, and the evidence path. Wrap URL syntax errors as `INVALID_DATABASE_URL`; never echo source values or the URL.

- [ ] **Step 4: Run the config test and verify GREEN**

Expected: 2 PASS and no sensitive value in thrown error messages.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scripts/supplier-purchase-batch-workflow-explain-config.ts \
  apps/api/src/scripts/supplier-purchase-batch-workflow-explain-config.test.ts
git commit -m "test(procurement): 锁定审批 EXPLAIN 证据输入"
```

## Task 2: Implement the pure plan parser and cardinality gate

**Files:**
- Create: `apps/api/src/scripts/supplier-purchase-batch-workflow-explain-evidence.test.ts`
- Create: `apps/api/src/scripts/supplier-purchase-batch-workflow-explain-evidence.ts`

- [ ] **Step 1: Write the RED matrix before implementation**

Create helpers for Seq Scan, direct Index Scan/Index Only Scan, and Bitmap Heap + Bitmap Index plans, then assert:

```ts
expect(classifyWorkflowCardinality(999)).toBe("small");
expect(classifyWorkflowCardinality(1000)).toBe("large");
expect(() => classifyWorkflowCardinality(-1)).toThrow("cardinality");
expect(assertWorkflowExplainGate(passingInput({
  cardinality: 45,
  node: seqScan("workflow_subject_states"),
}))).toBe(true);
expect(() => assertWorkflowExplainGate(passingInput({
  cardinality: 1000,
  node: seqScan("workflow_subject_states"),
}))).toThrow("Seq Scan");
expect(assertWorkflowExplainGate(passingInput({
  cardinality: 1000,
  node: indexScan(
    "workflow_subject_states",
    "idx_workflow_subject_states_subject",
  ),
}))).toBe(true);
expect(assertWorkflowExplainGate(passingInput({
  cardinality: 1000,
  node: bitmapScan(
    "workflow_subject_states",
    "idx_workflow_subject_states_subject",
  ),
}))).toBe(true);
```

Also assert exact `.code` values: malformed `Settings`/invalid block -> `INVALID_PLAN`; non-default Query Tuning -> `NON_DEFAULT_PLANNER`; planning/execution/shared-read/temp limits -> their documented codes; invalid index metadata/relation -> metadata codes; large wrong index -> `LARGE_TABLE_INDEX_REQUIRED`; and unknown, duplicate, missing plans in that order. A plan violating planning and large-index rules must return `PLANNING_THRESHOLD` first.

Lock the complete pure-module error vocabulary in the test:

```ts
expect(errorCodes).toEqual([
  "INVALID_PLAN",
  "NON_DEFAULT_PLANNER",
  "INVALID_CARDINALITY",
  "INDEX_RELATION_MISMATCH",
  "INDEX_METADATA_INVALID",
  "UNKNOWN_PLAN",
  "DUPLICATE_PLAN",
  "MISSING_PLAN",
  "PLANNING_THRESHOLD",
  "EXECUTION_THRESHOLD",
  "SHARED_READ_THRESHOLD",
  "TEMP_BLOCKS",
  "LARGE_TABLE_SEQ_SCAN",
  "LARGE_TABLE_INDEX_REQUIRED",
]);
```

- [ ] **Step 2: Run the test and verify RED**

```bash
cd apps/api && bun test src/scripts/supplier-purchase-batch-workflow-explain-evidence.test.ts
```

Expected: FAIL because the evidence module does not exist.

- [ ] **Step 3: Implement constants and explicit manifests**

```ts
export const WORKFLOW_EXPLAIN_THRESHOLDS = {
  statementTimeoutMs: 5_000,
  planningMs: 50,
  executionMs: 250,
  sharedReadBlocks: 20_000,
  tempBlocks: 0,
} as const;
export const WORKFLOW_EXPLAIN_CARDINALITY_LIMIT = 1_000;
export const WORKFLOW_EXPLAIN_QUERY_NAMES = [
  "running_instance", "pending_task", "subject_state",
] as const;
export type WorkflowExplainQueryName =
  typeof WORKFLOW_EXPLAIN_QUERY_NAMES[number];
export const WORKFLOW_EXPLAIN_MANIFEST = {
  running_instance: {
    relation: "workflow_instances",
    indexes: [
      "workflow_instances_running_purchase_batch_uidx",
      "workflow_instances_purchase_batch_lookup_idx",
    ],
  },
  pending_task: {
    relation: "workflow_tasks",
    indexes: ["idx_workflow_tasks_instance_status"],
  },
  subject_state: {
    relation: "workflow_subject_states",
    indexes: ["idx_workflow_subject_states_subject"],
  },
} as const;
```

`parseWorkflowExplainPlan(rows, name)` must require one row/root; require timing and root Plan; normalize missing top-level block fields to zero; recurse through `Plans` only for node facts; associate Bitmap Index descendants with their target Bitmap Heap; require `Schema=public` for target-relation nodes; and accept absent `Settings` only as `{}`.

- [ ] **Step 4: Implement stable assertions**

```ts
export function classifyWorkflowCardinality(value: number): "small" | "large" {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000) {
    fail("INVALID_CARDINALITY", "bounded cardinality is invalid");
  }
  return value < WORKFLOW_EXPLAIN_CARDINALITY_LIMIT ? "small" : "large";
}

export function assertWorkflowExplainGate(
  input: WorkflowExplainGateInput,
): true {
  for (const name of WORKFLOW_EXPLAIN_QUERY_NAMES) {
    classifyWorkflowCardinality(input.cardinalities[name]);
  }
  for (const name of WORKFLOW_EXPLAIN_QUERY_NAMES) {
    assertIndexMetadata(name, input.indexMetadata[name]);
  }
  assertPlanSet(input.plans); // UNKNOWN, DUPLICATE, MISSING
  for (const name of WORKFLOW_EXPLAIN_QUERY_NAMES) {
    const plan = input.plans.find((item) => item.name === name)!;
    assertDefaultExplainSettings(plan);
    assertRuntimeThresholds(plan); // planning, execution, reads, temp
    if (classifyWorkflowCardinality(input.cardinalities[name]) === "large") {
      if (plan.targetNodes.some((node) => node.nodeType === "Seq Scan")) {
        fail("LARGE_TABLE_SEQ_SCAN", `${name} target relation used Seq Scan`);
      }
      const approvedIndexes = new Set<string>(
        WORKFLOW_EXPLAIN_MANIFEST[name].indexes,
      );
      if (!plan.indexNames.some((index) => approvedIndexes.has(index))) {
        fail("LARGE_TABLE_INDEX_REQUIRED", `${name} approved index is required`);
      }
    }
  }
  return true;
}
```

Every listed index must belong to `public.<manifest relation>` and be valid/ready, even for a small table. Keep this file under 500 lines.

- [ ] **Step 5: Run the evidence suite and verify GREEN**

Expected: all boundary, parser, metadata, scan, threshold, and first-error cases PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/scripts/supplier-purchase-batch-workflow-explain-evidence.ts \
  apps/api/src/scripts/supplier-purchase-batch-workflow-explain-evidence.test.ts
git commit -m "feat(procurement): 分层校验审批 EXPLAIN 计划"
```

## Task 3: Build the one-transaction read-only runner

**Files:**
- Create: `apps/api/src/scripts/supplier-purchase-batch-workflow-explain.test.ts`
- Create: `apps/api/src/scripts/supplier-purchase-batch-workflow-explain.ts`

- [ ] **Step 1: Write transaction and SQL-shape tests**

Use an injected fake Bun SQL database and assert this exact event order:

```ts
expect(events).toEqual([
  "begin", "set-transaction", "statement-timeout", "transaction-guard",
  "backend-role",
  "planner-settings", "instance-preflight",
  "cardinality:workflow_instances", "cardinality:workflow_tasks",
  "cardinality:workflow_subject_states", "index-metadata",
  "explain:running_instance", "explain:pending_task", "explain:subject_state",
  "backend-guard-end", "close",
]);
```

Also verify repeatable-read/read-only is the first transaction statement, timeout precedes reads, backend pid is stable, role is superuser or BYPASSRLS, all Query Tuning settings plus `plan_cache_mode` use default or the registered `effective_cache_size` configuration-file baseline, bounded counts contain fixed `LIMIT 1000`, exact EXPLAIN SQL uses `VERBOSE` and `LIMIT 2`, PostgreSQL `57014` maps to `STATEMENT_TIMEOUT`, and output excludes URLs/UUIDs/raw predicates.

- [ ] **Step 2: Run the runner test and verify RED**

```bash
cd apps/api && bun test src/scripts/supplier-purchase-batch-workflow-explain.test.ts
```

Expected: FAIL because the runner does not exist.

- [ ] **Step 3: Define the exact query manifest**

```ts
const EXPLAIN = "explain (analyze, buffers, settings, verbose, format json)";
export const WORKFLOW_EXPLAIN_QUERIES = {
  running_instance: `${EXPLAIN}
select id from public.workflow_instances
where tenant_id = $1::uuid and subject_type = 'supplier_purchase_batch'
  and subject_id = $2::text and status = 'running'
order by created_at desc, id desc limit 2`,
  pending_task: `${EXPLAIN}
select id from public.workflow_tasks
where tenant_id = $1::uuid and instance_id = $2::uuid and status = 'pending'
order by created_at asc, id asc limit 2`,
  subject_state: `${EXPLAIN}
select subject_id from public.workflow_subject_states
where tenant_id = $1::uuid and subject_type = 'supplier_purchase_batch'
  and subject_id = $2::text limit 2`,
} as const;
```

Use three fixed bounded-count strings, each shaped as `select count(*)::integer from (select 1 from public.<fixed_table> limit 1000) bounded_rows`; never accept a caller-provided relation.

- [ ] **Step 4: Implement the ordered transaction**

```ts
export async function runWorkflowExplainGate(
  config: WorkflowExplainConfig,
  evidence: WorkflowExplainEvidenceInput,
  dependencies: WorkflowExplainDependencies = DEFAULT_DEPENDENCIES,
): Promise<WorkflowExplainSummary> {
  const database = dependencies.createDatabase(config.databaseUrl);
  let primaryFailure: unknown;
  try {
    return await database.begin(async (sql) => {
      await sql.unsafe("set transaction isolation level repeatable read, read only");
      await sql.unsafe("set local statement_timeout = '5000ms'");
      const startGuard = await readTransactionGuard(sql);
      assertTransactionGuard(startGuard);
      assertBypassRole(await readRoleCapability(sql));
      assertDefaultPlannerSettings(await readPlannerSettings(sql));
      await assertEvidenceInstance(sql, evidence);
      const cardinalities = await readBoundedCardinalities(sql);
      const indexMetadata = await readIndexMetadata(sql);
      const plans = await readExplainPlans(sql, evidence);
      const endGuard = await readTransactionGuard(sql);
      if (endGuard.backendPid !== startGuard.backendPid) {
        fail("TRANSACTION_GUARD_INVALID", "database backend changed");
      }
      assertWorkflowExplainGate({ cardinalities, indexMetadata, plans });
      return summarize(cardinalities, plans);
    });
  } catch (error) {
    primaryFailure = normalizeWorkflowExplainError(error);
    throw primaryFailure;
  } finally {
    try { await database.close(); } catch {
      if (primaryFailure === undefined) {
        throw new WorkflowExplainError("DATABASE_CLOSE_FAILED", "database close failed");
      }
    }
  }
}
```

`readIndexMetadata` joins `pg_index`, both table/index `pg_class` and namespaces. `readPlannerSettings` queries `category LIKE 'Query Tuning /%' OR name='plan_cache_mode'`. The success summary contains only gate, thresholds, bounded cardinality/classes, node/index names, timings, and buffers.

Use this stable serialized shape so the workflow and evidence inspection agree:

```ts
export type WorkflowExplainSummary = {
  gate: "supplier_purchase_batch_workflow";
  queryCount: 3;
  thresholds: typeof WORKFLOW_EXPLAIN_THRESHOLDS;
  queries: Record<WorkflowExplainQueryName, {
    cardinality: number;
    cardinalityClass: "small" | "large";
    nodeTypes: string[];
    indexNames: string[];
    planningMs: number;
    executionMs: number;
    sharedHitBlocks: number;
    sharedReadBlocks: number;
    tempReadBlocks: number;
    tempWrittenBlocks: number;
  }>;
};
```

`sharedReadBlocks` is PostgreSQL top-level `Shared Read Blocks`; missing block fields normalize to zero rather than being recursively summed.

- [ ] **Step 5: Implement the sanitized CLI**

```ts
async function main(): Promise<void> {
  try {
    const config = parseWorkflowExplainConfig(process.env);
    const evidence = parseWorkflowExplainEvidenceInput(
      JSON.parse(await Bun.file(config.evidenceFile).text()),
    );
    console.log(JSON.stringify(await runWorkflowExplainGate(config, evidence)));
  } catch (error) {
    const normalized = normalizeWorkflowExplainError(error);
    console.error(`SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_FAILED:${normalized.code}`);
    process.exitCode = 1;
  }
}
if (import.meta.main) void main();
```

- [ ] **Step 6: Run all focused suites and verify GREEN**

```bash
cd apps/api && bun test \
  src/scripts/supplier-purchase-batch-workflow-explain-config.test.ts \
  src/scripts/supplier-purchase-batch-workflow-explain-evidence.test.ts \
  src/scripts/supplier-purchase-batch-workflow-explain.test.ts
```

Expected: all cases PASS without a network or database connection.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/scripts/supplier-purchase-batch-workflow-explain.ts \
  apps/api/src/scripts/supplier-purchase-batch-workflow-explain.test.ts
git commit -m "feat(procurement): 运行只读审批 EXPLAIN 门禁"
```

## Task 4: Publish the command and runbook contract

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/scripts/supplier-purchase-batch-workflow-explain-docs-contract.test.ts`
- Modify: `docs/runbooks/supplier-purchase-batch-workflow-release.md`

- [ ] **Step 1: Write the failing documentation contract test**

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { WORKFLOW_EXPLAIN_SOURCE } from
  "./supplier-purchase-batch-workflow-explain-config";

const packageJson = JSON.parse(readFileSync(
  new URL("../../package.json", import.meta.url), "utf8",
)) as { scripts?: Record<string, string> };
const runbook = readFileSync(new URL(
  "../../../../docs/runbooks/supplier-purchase-batch-workflow-release.md",
  import.meta.url,
), "utf8");

describe("supplier purchase workflow EXPLAIN release contract", () => {
  test("publishes the command and cardinality rules", () => {
    expect(packageJson.scripts?.["supplier:purchase-batch-workflow:explain"])
      .toBe("bun src/scripts/supplier-purchase-batch-workflow-explain.ts");
    for (const value of [
      "supplier:purchase-batch-workflow:explain", "1,000", "small", "large",
      "50ms", "250ms", "20,000", "5,000ms", "REPEATABLE READ READ ONLY",
      "LARGE_TABLE_SEQ_SCAN", "LARGE_TABLE_INDEX_REQUIRED",
      WORKFLOW_EXPLAIN_SOURCE.artifactName,
    ]) expect(runbook).toContain(value);
  });
});
```

- [ ] **Step 2: Run the contract test and verify RED**

```bash
cd apps/api && bun test src/scripts/supplier-purchase-batch-workflow-explain-docs-contract.test.ts
```

Expected: FAIL because the package command and permanent runbook rule are absent.

- [ ] **Step 3: Add the API package script**

Insert immediately after the workflow smoke command:

```json
"supplier:purchase-batch-workflow:explain": "bun src/scripts/supplier-purchase-batch-workflow-explain.ts"
```

- [ ] **Step 4: Replace the temporary runbook rule**

Document the exact environment variables, immutable artifact/run, three query/index mappings, `< 1,000` and `>= 1,000` behavior, common thresholds, read-only repeatable-read transaction, stable failures, and protected workflow command. State that clone-only `enable_seqscan=off` proves structure only and cannot satisfy the dev gate.

The operational block must include this runnable command and decision table:

```markdown
SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_CONFIRM=development-read-only \
SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_DB_URL="${SUPABASE_DB_DIRECT_URL}" \
SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_EVIDENCE_FILE="${EVIDENCE_FILE}" \
bun run supplier:purchase-batch-workflow:explain

| 有界整表基数 | 默认 planner 的目标 relation 计划 | 结论 |
| --- | --- | --- |
| `< 1,000` | Seq Scan 或已批准索引；共同阈值内且索引元数据有效 | 通过 |
| `>= 1,000` | 无 Seq Scan，且命中该查询已批准索引 | 通过 |
| 任意 | planning `> 50ms`、execution `> 250ms`、shared read `> 20,000`、temp blocks `> 0` | 失败 |
```

- [ ] **Step 5: Run the contract test and verify GREEN**

Expected: package and runbook assertions PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json \
  apps/api/src/scripts/supplier-purchase-batch-workflow-explain-docs-contract.test.ts \
  docs/runbooks/supplier-purchase-batch-workflow-release.md
git commit -m "docs(procurement): 发布审批 EXPLAIN 分层门禁"
```

## Task 5: Add the protected dev workflow

**Files:**
- Create: `.github/workflows/verify-dev-supplier-purchase-workflow-explain.yml`
- Modify: `apps/api/src/scripts/supplier-purchase-batch-workflow-explain-docs-contract.test.ts`

- [ ] **Step 1: Extend the contract test and verify RED**

Read the workflow file and assert:

```ts
for (const value of [
  "workflow_dispatch", "environment: development", "actions: read",
  "33359680214", WORKFLOW_EXPLAIN_SOURCE.artifactName,
  "validate-dev-database-target.mjs", "supabase@2.99.0 migration list",
  "verify-migration-history.mjs", "20260830115000", "gh run download",
  "rollout-settings.json", "execute.json",
  "SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_CONFIRM",
  "supplier-purchase-workflow-explain-${COMMIT_SHA}",
]) expect(workflow).toContain(value);
expect(workflow).not.toMatch(/enable_seqscan\s*=\s*off/i);
```

Expected: RED because the workflow file does not exist.

- [ ] **Step 2: Create the workflow shell**

```yaml
name: Verify Dev Supplier Purchase Workflow EXPLAIN
on:
  workflow_dispatch:
    inputs:
      commit_sha:
        required: true
        type: string
      confirmation:
        required: true
        type: string
permissions:
  contents: read
  actions: read
concurrency:
  group: verify-dev-supplier-purchase-workflow-explain
  cancel-in-progress: false
jobs:
  verify:
    runs-on: [self-hosted, Linux, X64, gooes-dev-deploy]
    environment: development
    timeout-minutes: 20
    env:
      COMMIT_SHA: ${{ inputs.commit_sha }}
      CONFIRMATION: ${{ inputs.confirmation }}
      SOURCE_RUN_ID: "33359680214"
      SOURCE_ARTIFACT_NAME: supplier-purchase-workflow-acceptance-9d02854a88d5ca83a2f883b923de1ffcd7d49bd3
      DEV_DB_ENV_FILE: /opt/gooes-dev/docker/.env.dev.db
      DEV_PROJECT_REF: fclnkyatvfvmzgzdqlba
      DEV_DB_HOST: api-dev.goodcms.cn
      BLOCKED_PROJECT_REFS: unqhypivjkpwldhufpjc
      BLOCKED_DB_HOSTS: api.goodcms.cn 1.13.20.39
```

- [ ] **Step 3: Implement target, revision, and migration guards**

Use `set -euo pipefail`, checkout `${COMMIT_SHA}`, and run:

```bash
test "${RUNNER_NAME}" = "gooes-dev-vm-0-11"
test "${CONFIRMATION}" = "development-read-only"
[[ "${COMMIT_SHA}" =~ ^[a-f0-9]{40}$ ]]
test "$(git rev-parse HEAD)" = "${COMMIT_SHA}"
set -a; . "${DEV_DB_ENV_FILE}"; set +a
ACTUAL_PROJECT_REF="$(node scripts/validate-dev-database-target.mjs --resolve-project-ref)"
node scripts/validate-dev-database-target.mjs --direct-migration-history \
  "${SUPABASE_DB_DIRECT_URL}" "${ACTUAL_PROJECT_REF}" "${DEV_DB_HOST}" \
  "${DEV_PROJECT_REF}" "${BLOCKED_DB_HOSTS}" "${BLOCKED_PROJECT_REFS}"
pnpm dlx supabase@2.99.0 migration list --db-url "${SUPABASE_DB_DIRECT_URL}" \
  > migration-history.txt
node scripts/verify-migration-history.mjs migration-history.txt \
  supabase/migrations 20260830115000 > migration-evidence.json
```

Print `INVALID_DEV_TARGET` or `MIGRATION_HISTORY_MISMATCH` before exiting the corresponding guard; never print database variables.

- [ ] **Step 4: Download and normalize the source artifact**

```bash
evidence_dir="${RUNNER_TEMP}/supplier-purchase-workflow-source"
mkdir -p "${evidence_dir}"
timeout --signal=TERM --kill-after=10s 120 gh run download "${SOURCE_RUN_ID}" \
  --repo "${GITHUB_REPOSITORY}" -n "${SOURCE_ARTIFACT_NAME}" -D "${evidence_dir}"
jq -n \
  --arg sourceRunId "${SOURCE_RUN_ID}" \
  --arg artifactName "${SOURCE_ARTIFACT_NAME}" \
  --arg tenantId "$(jq -er '.tenant_id' "${evidence_dir}/rollout-settings.json")" \
  --arg batchId "$(jq -er '.batchId' "${evidence_dir}/execute.json")" \
  --arg instanceId "$(jq -er '.instanceId' "${evidence_dir}/execute.json")" \
  '{sourceRunId:$sourceRunId,artifactName:$artifactName,tenantId:$tenantId,batchId:$batchId,instanceId:$instanceId}' \
  > workflow-explain-input.json
```

Set `GH_TOKEN: ${{ github.token }}` only for this step.

- [ ] **Step 5: Install, run, and upload normalized evidence**

After Node 22, Bun 1.3.2, and frozen API/domain workspace installation:

```bash
SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_CONFIRM=development-read-only \
SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_DB_URL="${SUPABASE_DB_DIRECT_URL}" \
SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_EVIDENCE_FILE="${GITHUB_WORKSPACE}/workflow-explain-input.json" \
bun --cwd apps/api run supplier:purchase-batch-workflow:explain \
  > workflow-explain-summary.json
jq -e '.gate == "supplier_purchase_batch_workflow" and .queryCount == 3' \
  workflow-explain-summary.json >/dev/null
```

Upload only `workflow-explain-summary.json` and `migration-evidence.json` as `supplier-purchase-workflow-explain-${COMMIT_SHA}` with error-on-missing and 30-day retention. Do not upload the normalized UUID input, raw plans, or database environment.

- [ ] **Step 6: Run the contract and verify GREEN**

```bash
cd apps/api && bun test src/scripts/supplier-purchase-batch-workflow-explain-docs-contract.test.ts
```

Expected: all package/workflow/runbook assertions PASS.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/verify-dev-supplier-purchase-workflow-explain.yml \
  apps/api/src/scripts/supplier-purchase-batch-workflow-explain-docs-contract.test.ts
git commit -m "ci(procurement): 保护审批 EXPLAIN dev 验收"
```

## Task 6: Verify, integrate, and run the dev gate

**Files:**
- Modify after a successful run: `docs/operations/evidence/2026-08-30-supplier-purchase-batch-workflow-dev.md`

- [ ] **Step 1: Run complete local verification**

```bash
cd apps/api && bun test \
  src/scripts/supplier-purchase-batch-workflow-explain-config.test.ts \
  src/scripts/supplier-purchase-batch-workflow-explain-evidence.test.ts \
  src/scripts/supplier-purchase-batch-workflow-explain.test.ts \
  src/scripts/supplier-purchase-batch-workflow-explain-docs-contract.test.ts
cd ../.. && bun run api:typecheck
bun run api:build
bun run api:check-file-size
bun run test
git diff --check
```

Expected: focused tests PASS, TypeScript/build/file-size/stable workspace gates pass, and `git diff --check` emits nothing.

- [ ] **Step 2: Confirm the database boundary**

```bash
if git diff --name-only origin/main...HEAD | rg -q '^supabase/migrations/'; then
  echo "unexpected migration change" >&2
  exit 1
fi
git status --short
```

Expected: no migration path and a clean worktree. This feature runs no local or remote DDL/DML.

- [ ] **Step 3: Finish the branch and push main**

Invoke `superpowers:finishing-a-development-branch`; re-run its verification, fast-forward main, and push the exact SHA without force. Do not alter Orange.

- [ ] **Step 4: Wait for standard dev build/deploy**

```bash
main_sha="$(git rev-parse origin/main)"
gh run list --branch main --commit "${main_sha}" --limit 20
```

Expected: standard build and dev deployment succeed for the exact main SHA before dispatching the database gate.

- [ ] **Step 5: Dispatch and watch the protected workflow**

```bash
main_sha="$(git rev-parse origin/main)"
gh workflow run verify-dev-supplier-purchase-workflow-explain.yml \
  --ref main -f commit_sha="${main_sha}" -f confirmation=development-read-only
run_id="$(gh run list \
  --workflow verify-dev-supplier-purchase-workflow-explain.yml \
  --branch main --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "${run_id}" --exit-status
```

Expected: success. The small `workflow_subject_states` Seq Scan passes with valid index metadata and thresholds; the other plans retain approved indexes.

- [ ] **Step 6: Download and inspect normalized evidence**

```bash
evidence_dir="$(mktemp -d)"
main_sha="$(git rev-parse origin/main)"
gh run download "${run_id}" \
  -n "supplier-purchase-workflow-explain-${main_sha}" -D "${evidence_dir}"
jq -e '
  .gate == "supplier_purchase_batch_workflow" and
  .queryCount == 3 and
  .queries.subject_state.cardinalityClass == "small" and
  (.queries.subject_state.nodeTypes | index("Seq Scan")) != null
' "${evidence_dir}/workflow-explain-summary.json"
```

Expected: jq exit 0, every threshold passes, and artifacts contain no DB URL or credential.

- [ ] **Step 7: Record and commit the result**

Add the exact implementation commit, dev build/deploy runs, protected workflow run, artifact name, three bounded cardinality classes, node/index names, timings/buffers, migration alignment, and false-negative closure to the existing evidence doc. Do not include URLs with credentials, database roles, raw predicates, or secrets.

```bash
git add docs/operations/evidence/2026-08-30-supplier-purchase-batch-workflow-dev.md
git commit -m "docs(procurement): 记录审批 EXPLAIN dev 证据"
git push origin main
```

- [ ] **Step 8: Stop at the scope boundary**

The old `/review` versus new task-complete negative HTTP matrix is a separate operational acceptance plan because it mutates business evidence. Do not mix it into this read-only EXPLAIN implementation.
