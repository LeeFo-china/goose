# Customer Workflow Runtime Production Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore missing `customer_main` runtime state for the confirmed production tenant and make future customer workflow initialization observable and retryable.

**Architecture:** Release an API-side initialization orchestrator plus a protected production dry-run workflow first. Use the enhanced existing backfill script to freeze and audit the exact `potential` customer candidate set, then create a tenant-scoped migration that atomically starts those runtimes, assigns pending tasks, and refreshes subject projections.

**Tech Stack:** Bun, TypeScript, Fastify, Supabase/PostgreSQL migrations and RPCs, GitHub Actions production Runner.

---

## File Structure

- Modify `apps/api/src/scripts/workflow-runtime-backfill/{types,cli,data,runner,report}.ts`
  to add an immutable customer audit cutoff and structured summaries.
- Modify focused tests under
  `apps/api/src/scripts/workflow-runtime-backfill/*.test.ts`.
- Create `apps/api/src/services/customer-workflow-initialization.ts` and its test
  to retry, assign the task, sync subject state, and return a stable outcome.
- Modify `apps/api/src/controllers/customer/index.ts` and add a focused contract test
  for the response and structured error log.
- Create `.github/workflows/audit-production-customer-workflow.yml` and
  `scripts/audit-production-customer-workflow-contract.test.ts`.
- After dry-run, create
  `supabase/migrations/20261001120000_backfill_qingtian_potential_customer_workflow.sql`
  and a migration content test.
- Create `docs/operations/evidence/2026-10-01-qingtian-customer-workflow-runtime-repair.md`.

## Task 1: Enhance the Existing Customer Dry-Run Audit

**Files:**
- Modify: `apps/api/src/scripts/workflow-runtime-backfill/types.ts`
- Modify: `apps/api/src/scripts/workflow-runtime-backfill/cli.ts`
- Modify: `apps/api/src/scripts/workflow-runtime-backfill/data.ts`
- Modify: `apps/api/src/scripts/workflow-runtime-backfill/runner.ts`
- Modify: `apps/api/src/scripts/workflow-runtime-backfill/report.ts`
- Test: `apps/api/src/scripts/workflow-runtime-backfill/cli.test.ts`
- Test: `apps/api/src/scripts/workflow-runtime-backfill/runner.test.ts`

- [ ] **Step 1: Write failing CLI and report tests**

Add a CLI test for a fixed UTC cutoff:

```ts
expect(parseBackfillArgs([
  "--tenant-id", "3eebca47-961f-4899-b976-a3d3208d326b",
  "--subject-type", "customer",
  "--dry-run",
  "--created-before", "2026-10-01T02:03:04.000Z",
])).toMatchObject({
  apply: false,
  subjectType: "customer",
  createdBefore: "2026-10-01T02:03:04.000Z",
});
```

Add rejection cases for an invalid date and for using the cutoff with a non-customer
subject. Add runner/report assertions for `generatedAt`, `createdBefore`,
per-status/action counts, and a planned-row section containing dry-run candidates.

- [ ] **Step 2: Run tests and verify RED**

```bash
cd apps/api
bun test src/scripts/workflow-runtime-backfill/cli.test.ts
bun test src/scripts/workflow-runtime-backfill/runner.test.ts
```

Expected: failures because the cutoff and structured summaries do not exist.

- [ ] **Step 3: Implement the cutoff and summaries**

Extend `CliOptions`:

```ts
export type CliOptions = {
  tenantId: string;
  apply: boolean;
  reportPath: string;
  subjectType?: BackfillSubjectType;
  createdBefore?: string;
};
```

Parse `--created-before` as a canonical ISO timestamp. Add the cutoff only to the
customer paged query with `.lte("created_at", createdBefore)`. Return:

```ts
return {
  apply: options.apply,
  generatedAt,
  createdBefore: options.createdBefore ?? null,
  scanned: allResults.length,
  summary: summarizeResults(allResults),
  statusSummary: summarizeResultsByLegacyStatus(allResults),
  outputPath,
};
```

The private Markdown report includes planned subject ID, legacy status, node key,
and `task_created` only for `dry_run_create` rows.

- [ ] **Step 4: Run tests and verify GREEN**

Run Step 2 again. Expected: both test files pass independently.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scripts/workflow-runtime-backfill
git commit -m "fix(workflow): 增强客户回填审核报告"
```

## Task 2: Add Retryable Customer Workflow Initialization

**Files:**
- Create: `apps/api/src/services/customer-workflow-initialization.ts`
- Create: `apps/api/src/services/customer-workflow-initialization.test.ts`
- Modify: `apps/api/src/controllers/customer/index.ts`
- Create: `apps/api/src/controllers/customer/customer-create-workflow-initialization.test.ts`

- [ ] **Step 1: Write the failing service tests**

Test this public result contract:

```ts
type CustomerWorkflowInitializationResult =
  | { status: "ready"; attempts: number }
  | {
    status: "degraded";
    attempts: number;
    code:
      | "CUSTOMER_WORKFLOW_CONFIGURATION_MISSING"
      | "CUSTOMER_WORKFLOW_INITIALIZATION_FAILED";
    reason: string;
  };
```

Cover first-call success, failed-then-success retry, configuration missing without
retry, two failed attempts, owner assignment, ownerless projection sync, and
`running_instance_exists` recovery.

- [ ] **Step 2: Run the service test and verify RED**

```bash
cd apps/api
bun test src/services/customer-workflow-initialization.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement the minimal orchestrator**

Create:

```ts
async initialize(input: {
  authContext: AuthContext;
  tenantId: string;
  customerId: string;
  ownerId: string | null;
}): Promise<CustomerWorkflowInitializationResult>
```

Call `syncCustomerCreated` at most twice and retry only `status === "failed"`.
Treat `started` and `skipped/running_instance_exists` as ready. On ready, call
`customerOwnerAssignmentService.syncWorkflowTasksAfterOwnerAssignment` when an owner
exists; otherwise call `workflowSubjectStateService.syncFromRuntimeInstance` with the
returned IDs. Never expose `error_message` in the public result.

- [ ] **Step 4: Run the service test and verify GREEN**

Run Step 2 again. Expected: all cases pass.

- [ ] **Step 5: Write the failing controller contract test**

Prove `CustomerController.create` passes `payload.owner_id`, adds
`workflow_initialization` to the response, and for a degraded result calls
`request.log.error` with only stable code, request ID, tenant ID, customer ID, reason,
and attempts. It must not log customer name, phone, body, or full response.

- [ ] **Step 6: Run the controller test and verify RED**

```bash
cd apps/api
bun test src/controllers/customer/customer-create-workflow-initialization.test.ts
```

Expected: fail because the controller still calls `syncCustomerCreated` directly.

- [ ] **Step 7: Wire the orchestrator**

Replace the direct runtime call and return:

```ts
const detail = await this.buildCustomerDetailResponse(customer, options);
return ResponseHandler.success({
  ...detail,
  workflow_initialization: initialization,
});
```

Log one error record with message
`[customer-create] workflow initialization degraded` only when degraded.

- [ ] **Step 8: Run both tests and verify GREEN**

Run the two test files separately. Expected: both pass without mock-module leakage.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/services/customer-workflow-initialization.ts \
  apps/api/src/services/customer-workflow-initialization.test.ts \
  apps/api/src/controllers/customer/index.ts \
  apps/api/src/controllers/customer/customer-create-workflow-initialization.test.ts
git commit -m "fix(customer): 加固客户工作流初始化"
```

## Task 3: Add the Protected Production Dry-Run Workflow

**Files:**
- Create: `.github/workflows/audit-production-customer-workflow.yml`
- Create: `scripts/audit-production-customer-workflow-contract.test.ts`

- [ ] **Step 1: Write the failing workflow contract test**

Assert the workflow contains the production Runner, fixed tenant UUID, exact
confirmation text, `--subject-type customer`, `--dry-run`, `--created-before`,
container revision validation, and `actions/upload-artifact@v6`. Assert it does not
contain `--apply` and requires exact tenant and deployed SHA inputs.

- [ ] **Step 2: Run the contract test and verify RED**

```bash
bun test scripts/audit-production-customer-workflow-contract.test.ts
```

Expected: fail because the workflow does not exist.

- [ ] **Step 3: Create the workflow**

Use only `workflow_dispatch`, `contents: read`, the
`deploy-docker-services-main` concurrency group, a ten-minute timeout, and
`environment: production`.

1. Guard Runner, exact tenant/confirmation/SHA, container health/revision, tenant,
   active definition/version, start-to-potential, and potential-to-following.
2. Freeze `audit_cutoff`; run the deployed container script with dry-run only and
   `docker cp` JSON/Markdown to `RUNNER_TEMP`.
3. Upload both files for seven days, then fail on failed rows, missing definition,
   missing mapped node, or non-potential create candidates.

Do not echo environment files, secrets, customer rows, names, or phones.

- [ ] **Step 4: Run the contract test and verify GREEN**

Run Step 2 again. Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/audit-production-customer-workflow.yml \
  scripts/audit-production-customer-workflow-contract.test.ts
git commit -m "ci(workflow): 增加生产客户流程审核"
```

## Task 4: Verify and Release the API Reliability Fix

- [ ] **Step 1: Run focused tests separately**

Include all new tests plus existing customer workflow runtime, action metadata, and
customer status tests. Run files separately to avoid `mock.module` pollution.

- [ ] **Step 2: Run static checks**

```bash
bun run api:check
git diff --check origin/main...HEAD
```

Expected: typecheck, build, file-size, and diff checks pass.

- [ ] **Step 3: Rebase on remote main and repeat verification**

Resolve only in-scope conflicts. Fast-forward main after checks pass.

- [ ] **Step 4: Push and tag**

Create the next available annotated `v2026.10.01.N` tag only after remote main and
the verified local commit match.

- [ ] **Step 5: Build and deploy API**

Dispatch `release-production.yml` with `service=api`; deploy the exact successful
candidate run ID and SHA. Require container health, runtime revision evidence,
deployment receipt, and HTTP 200 from `https://api.goodcms.cn/`.

## Task 5: Run and Review the Production Dry-Run

- [ ] **Step 1: Dispatch the audit**

Use the deployed SHA, exact tenant ID, and exact confirmation text.

- [ ] **Step 2: Download immutable evidence**

Require workflow success, matching container revision, `apply=false`, and a frozen
`createdBefore` cutoff.

- [ ] **Step 3: Review candidates**

Every create candidate must have `legacy_status=potential`, `node_key=potential`,
`task_created=true`, and no existing instance. Require zero failed,
missing-definition, mapped-node-missing, and non-potential create rows.

- [ ] **Step 4: Stop on any gate failure**

Do not create or apply a migration until the audit is clean.

## Task 6: Create the Audited Migration

**Files:**
- Create: `supabase/migrations/20261001120000_backfill_qingtian_potential_customer_workflow.sql`
- Create: `apps/api/src/scripts/qingtian-customer-workflow-backfill-migration-content.test.ts`

- [ ] **Step 1: Write the failing migration content test**

Assert the migration includes the fixed tenant, literal audited UTC cutoff and count,
`status = 'potential'`, an all-instance `NOT EXISTS` guard, fail-closed definition and
graph checks, `start_workflow_instance`, checked `ok`, pending-task owner assignment,
subject-state upsert, and final count assertions. Assert it contains no `DELETE` or
cancellation.

- [ ] **Step 2: Run and verify RED**

```bash
cd apps/api
bun test src/scripts/qingtian-customer-workflow-backfill-migration-content.test.ts
```

Expected: fail because the migration does not exist.

- [ ] **Step 3: Create migration from audit literals**

Copy `createdBefore` and the potential `dry_run_create` count from the artifact as
literal SQL constants. In one `DO $repair$` block:

1. no-op if the tenant is absent;
2. lock and validate the single active definition/version and graph;
3. select and lock only audited potential customers with no instance;
4. assert count equals the audit literal;
5. call `start_workflow_instance` and require `ok=true`, node `potential`, and task ID;
6. assign task to `customer.owner_id`;
7. upsert subject state from persisted facts;
8. assert instance, pending-task, and projection counts all equal the literal.

- [ ] **Step 4: Verify GREEN and static checks**

Run the content test, relevant migration contract tests, `bun run api:check`, and
`git diff --check`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261001120000_backfill_qingtian_potential_customer_workflow.sql \
  apps/api/src/scripts/qingtian-customer-workflow-backfill-migration-content.test.ts
git commit -m "fix(workflow): 回填晴天潜在客户流程"
```

## Task 7: Apply and Verify Production Migration

- [ ] **Step 1: Push migration commit and next annotated tag**

Confirm tag dereferences to the migration commit.

- [ ] **Step 2: Run migration plan**

Dispatch `migrate-production-database.yml` in `plan` mode. Require exactly the new
backfill migration and no unrelated pending migration.

- [ ] **Step 3: Apply migration**

Dispatch the same tag with mode `apply` and confirmation
`确认迁移生产数据库`. Require backup, transaction, history, and post-check success.

- [ ] **Step 4: Verify alignment and repeat audit**

Confirm Local/Remote versions align, then rerun the dry-run. Require zero remaining
potential `dry_run_create` rows and zero failures.

- [ ] **Step 5: Verify customer details read-only**

For repaired samples require:

```text
instance_status=running
current_node_key=potential
pending_task_count>=1
actions contains business_action=start_following
```

Keep raw identifiers out of the repository and public logs.

- [ ] **Step 6: Record evidence and commit**

Record tag/SHA, run IDs, candidate count/cutoff, post-audit zero result, and API
acceptance summary without personal data.

## Task 8: Validate `start_following`

- [ ] **Step 1: Run automated transition regression**

Require `start_following` to change both customer status and workflow current node
from `potential` to `following`.

- [ ] **Step 2: Obtain an explicitly approved live customer**

Do not choose a real business customer automatically. The user or mini-program owner
must provide a customer that may be advanced.

- [ ] **Step 3: Perform live action after approval**

Complete the returned action through the normal API and reread detail. Require both
statuses to be `following` and the old potential task not pending.

- [ ] **Step 4: Update handoff**

Tell orange that a client release cannot repair stored runtime data and it must keep
consuming backend actions without synthesizing them. Confirm orange remained untouched.
